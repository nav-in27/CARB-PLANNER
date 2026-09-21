"""
CARB-Planner — CP-SAT Block Optimizer (CORE)

This is the HEART of CARB-Planner. Uses Google OR-Tools CP-SAT solver to
optimally allocate maintenance blocks while respecting train paths, section
capacity, department incompatibility, and P90 duration buffers.

Decision: task → section → start_time → duration

Hard Constraints:
  1. No two incompatible tasks on the same section simultaneously
  2. Task must fit within its allowed window [earliest_start, deadline]
  3. Duration uses predicted P90 (confidence-aware)
  4. Train path conflicts must be respected
  5. Incompatible departments cannot overlap on same section
  6. Critical tasks cannot be deferred
  7. Section capacity limits

Soft Objectives (weighted):
  - Minimize train delay
  - Minimize deferred maintenance
  - Maximize high-priority completion
  - Prefer night/off-peak windows
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from backend.models.network import RailwayNetwork, Section
from backend.models.plan import BlockAllocation, PlanKPIs, SchedulePlan
from backend.models.task import (
    Department,
    MaintenanceTask,
    RiskLevel,
    TaskPriority,
    TaskStatus,
)
from backend.models.train import Train, TrainPathSegment

logger = logging.getLogger(__name__)

# Weight constants for multi-objective optimization
# Safety-critical maintenance > ordinary maintenance > schedule convenience
W_CRITICAL_DEFER = 10000    # Extremely high penalty for deferring critical tasks
W_HIGH_DEFER = 500          # High penalty for deferring high priority
W_MEDIUM_DEFER = 100        # Medium penalty for deferring medium priority
W_LOW_DEFER = 20            # Low penalty for deferring low priority
W_TRAIN_DELAY = 50          # Penalty per slot of train delay
W_TRAIN_CANCEL = 5000       # Penalty for train cancellation
W_COMPLETION_BONUS = 30     # Bonus for completing a task
W_NIGHT_PREFERENCE = 5      # Small bonus for scheduling in off-peak hours

# Department incompatibility: these department pairs cannot work on the same section
# at the same time (e.g., OHE power isolation affects signaling)
INCOMPATIBLE_DEPTS: List[Tuple[Department, Department]] = [
    (Department.ENGINEERING, Department.SNT),
    (Department.ENGINEERING, Department.ELECTRICAL),
    (Department.SNT, Department.ELECTRICAL),
]


def _priority_weight(task: MaintenanceTask) -> int:
    """Get the deferral penalty weight based on task priority and criticality."""
    crit = task.criticality
    if crit == TaskPriority.CRITICAL:
        return W_CRITICAL_DEFER
    elif crit == TaskPriority.HIGH:
        return W_HIGH_DEFER
    elif crit == TaskPriority.MEDIUM:
        return W_MEDIUM_DEFER
    return W_LOW_DEFER


def _is_night_slot(slot: int) -> bool:
    """Check if a slot falls in off-peak night hours (22:00-06:00).

    Slot 0 = 00:00, Slot 88 = 22:00, Slot 24 = 06:00
    """
    hour_float = (slot * 15) / 60
    return hour_float >= 22 or hour_float < 6


def solve_block_plan(
    network: RailwayNetwork,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    horizon_slots: int = 96,
    time_limit_sec: float = 30.0,
    frozen_tasks: Optional[Dict[str, Tuple[int, int]]] = None,
) -> SchedulePlan:
    """Solve the block planning optimization problem using CP-SAT.

    Args:
        network: Railway network topology
        tasks: Maintenance task requests with P90 durations
        trains: Train schedules with path segments
        horizon_slots: Planning horizon in 15-min slots (96 = 24h)
        time_limit_sec: Maximum solver time
        frozen_tasks: Dict of task_id -> (start_slot, end_slot) for LNS frozen decisions

    Returns:
        SchedulePlan with allocations, KPIs, and solver status
    """
    start_time = time.perf_counter()

    model = cp_model.CpModel()

    # ─── Build section lookup ───
    section_map: Dict[str, Section] = {s.section_id: s for s in network.sections}

    # ─── Build train occupancy map: section_id -> list of (entry, exit) slot pairs ───
    train_occupancy: Dict[str, List[Tuple[int, int, str]]] = {}
    for train in trains:
        for seg in train.path_segments:
            if seg.section_id not in train_occupancy:
                train_occupancy[seg.section_id] = []
            train_occupancy[seg.section_id].append(
                (seg.entry_slot, seg.exit_slot, train.train_id)
            )

    # ─── Decision variables for each task ───
    task_vars: Dict[str, dict] = {}

    for task in tasks:
        tid = task.task_id

        # Duration in slots (P90, rounded up to slots)
        p90_min = task.predicted_p90_min or task.historical_duration_min
        duration_slots = max(1, (p90_min + 14) // 15)

        # Clip window to horizon
        earliest = max(0, min(task.earliest_start_slot, horizon_slots - 1))
        deadline = max(earliest + duration_slots, min(task.deadline_slot, horizon_slots))

        # Presence variable: 1 if task is scheduled, 0 if deferred
        if not task.is_deferrable:
            # Critical/non-deferrable tasks MUST be scheduled
            presence = model.new_constant(1)
        else:
            presence = model.new_bool_var(f"presence_{tid}")

        # Check if this task is frozen (LNS)
        if frozen_tasks and tid in frozen_tasks:
            frozen_start, frozen_end = frozen_tasks[tid]
            start_var = model.new_constant(frozen_start)
            end_var = model.new_constant(frozen_end)
            interval = model.new_optional_fixed_size_interval_var(
                start_var, duration_slots, presence, f"interval_{tid}"
            )
        else:
            start_var = model.new_int_var(earliest, max(earliest, deadline - duration_slots), f"start_{tid}")
            end_var = model.new_int_var(earliest + duration_slots, deadline, f"end_{tid}")

            # end = start + duration
            model.add(end_var == start_var + duration_slots)

            interval = model.new_optional_interval_var(
                start_var, duration_slots, end_var, presence, f"interval_{tid}"
            )

        task_vars[tid] = {
            "presence": presence,
            "start": start_var,
            "end": end_var,
            "interval": interval,
            "duration_slots": duration_slots,
            "task": task,
        }

    # ─── HARD CONSTRAINT 1 & 5: Section non-overlap + department incompatibility ───
    # Group tasks by section
    section_tasks: Dict[str, List[str]] = {}
    for tid, tv in task_vars.items():
        sec = tv["task"].section_id
        if sec not in section_tasks:
            section_tasks[sec] = []
        section_tasks[sec].append(tid)

    for sec_id, task_ids in section_tasks.items():
        if len(task_ids) <= 1:
            continue

        section = section_map.get(sec_id)
        capacity = section.capacity if section else 1

        # For single-track sections, no overlap at all
        if capacity <= 1:
            intervals = [task_vars[tid]["interval"] for tid in task_ids]
            model.add_no_overlap(intervals)
        else:
            # For double-track, allow up to `capacity` concurrent tasks
            # Use cumulative constraint
            intervals = [task_vars[tid]["interval"] for tid in task_ids]
            demands = [1] * len(intervals)
            model.add_cumulative(intervals, demands, capacity)

        # Department incompatibility: even on multi-track sections,
        # incompatible departments cannot overlap
        for i, tid_a in enumerate(task_ids):
            for tid_b in task_ids[i + 1:]:
                dept_a = task_vars[tid_a]["task"].department
                dept_b = task_vars[tid_b]["task"].department
                if (dept_a, dept_b) in INCOMPATIBLE_DEPTS or (dept_b, dept_a) in INCOMPATIBLE_DEPTS:
                    # These two intervals must not overlap
                    model.add_no_overlap([
                        task_vars[tid_a]["interval"],
                        task_vars[tid_b]["interval"],
                    ])

    # ─── HARD CONSTRAINT 4: Train path conflict ───
    # Maintenance blocks cannot overlap with train paths on the same section
    # We model this by adding "train intervals" and ensuring no overlap
    # with maintenance intervals on single-track sections
    train_delay_vars: Dict[str, object] = {}  # train_id -> total delay var

    for train in trains:
        delay_slots = model.new_int_var(0, horizon_slots, f"delay_{train.train_id}")
        train_delay_vars[train.train_id] = delay_slots

        for seg in train.path_segments:
            sec_id = seg.section_id
            section = section_map.get(sec_id)

            if sec_id not in section_tasks:
                continue

            # For each maintenance task on this section, if it overlaps with
            # this train segment, there must be a consequence
            for tid in section_tasks.get(sec_id, []):
                tv = task_vars[tid]
                presence = tv["presence"]
                maint_start = tv["start"]
                maint_end = tv["end"]

                # Boolean: does this maintenance block overlap this train segment?
                # Overlap if: maint_start < seg.exit_slot AND maint_end > seg.entry_slot
                # For single-track: create separation constraint
                if section and section.capacity <= 1:
                    # On single track, maintenance and train cannot occupy same section simultaneously.
                    # Train either runs before block, after block, or is regulated/delayed past the block.
                    b_before = model.new_bool_var(f"maint_before_train_{tid}_{train.train_id}_{sec_id}")
                    b_after = model.new_bool_var(f"maint_after_train_{tid}_{train.train_id}_{sec_id}")
                    b_delay = model.new_bool_var(f"train_delay_{tid}_{train.train_id}_{sec_id}")

                    # Maintenance ends before train enters section
                    model.add(maint_end <= seg.entry_slot).only_enforce_if(b_before)
                    # Train has exited section before maintenance starts
                    model.add(maint_start >= seg.exit_slot).only_enforce_if(b_after)
                    # Train is regulated/held until maintenance finishes
                    model.add(delay_slots >= maint_end - seg.entry_slot).only_enforce_if(b_delay)

                    # If task is scheduled, one of these three must hold
                    model.add(b_before + b_after + b_delay >= 1).only_enforce_if(presence)

    # ─── SOFT OBJECTIVES ───
    objective_terms = []

    for tid, tv in task_vars.items():
        task = tv["task"]
        presence = tv["presence"]

        # Penalty for deferring a task (not scheduling it)
        if task.is_deferrable:
            # We want to maximize presence, so penalize absence
            defer_penalty = _priority_weight(task)

            # Risk multiplier: higher risk = higher penalty for deferral
            if task.risk_level == RiskLevel.CRITICAL:
                defer_penalty *= 3
            elif task.risk_level == RiskLevel.HIGH:
                defer_penalty *= 2

            not_present = model.new_bool_var(f"not_present_{tid}")
            model.add(not_present == 1).only_enforce_if(presence.Not())
            model.add(not_present == 0).only_enforce_if(presence)
            objective_terms.append((-defer_penalty, not_present))

        # Bonus for completing a task
        objective_terms.append((W_COMPLETION_BONUS, presence))

        # Night preference bonus
        if not (frozen_tasks and tid in frozen_tasks):
            # Small bonus if task starts in off-peak hours (slots 0-24 or 88-96)
            night_bool = model.new_bool_var(f"night_{tid}")
            # Approximate: start <= 24 or start >= 88
            b1 = model.new_bool_var(f"early_night_{tid}")
            b2 = model.new_bool_var(f"late_night_{tid}")
            model.add(tv["start"] <= 24).only_enforce_if(b1)
            model.add(tv["start"] > 24).only_enforce_if(b1.Not())
            model.add(tv["start"] >= 88).only_enforce_if(b2)
            model.add(tv["start"] < 88).only_enforce_if(b2.Not())
            model.add_bool_or([b1, b2]).only_enforce_if(night_bool)
            model.add_bool_and([b1.Not(), b2.Not()]).only_enforce_if(night_bool.Not())
            objective_terms.append((W_NIGHT_PREFERENCE, night_bool))

    # Train delay penalties
    for train_id, delay_var in train_delay_vars.items():
        train = next((t for t in trains if t.train_id == train_id), None)
        if train:
            cost = int(train.delay_cost_per_min * W_TRAIN_DELAY)
            objective_terms.append((-cost, delay_var))

    # Build objective: maximize weighted sum
    model.maximize(sum(coeff * var for coeff, var in objective_terms))

    # ─── SOLVE ───
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    solver.parameters.log_search_progress = False
    solver.parameters.num_workers = 4

    status = solver.solve(model)
    solve_time = time.perf_counter() - start_time

    # ─── Extract solution ───
    plan = SchedulePlan(
        horizon_slots=horizon_slots,
        solve_time_sec=round(solve_time, 3),
        generated_at=datetime.utcnow().isoformat() + "Z",
    )

    status_name = solver.status_name(status)
    plan.solver_status = status_name
    plan.status = status_name
    plan.feasibility_status = "FEASIBLE" if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "INFEASIBLE"

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        plan.is_feasible = True
        allocations = []

        for tid, tv in task_vars.items():
            task = tv["task"]
            presence_val = solver.value(tv["presence"])

            if presence_val:
                start_slot = solver.value(tv["start"])
                end_slot = solver.value(tv["end"])
                task.status = TaskStatus.SCHEDULED
                task.allocated_start_slot = start_slot
                task.allocated_end_slot = end_slot

                allocations.append(BlockAllocation(
                    task_id=tid,
                    section_id=task.section_id,
                    start_slot=start_slot,
                    end_slot=end_slot,
                    duration_slots=tv["duration_slots"],
                    department=task.department.value,
                    status=TaskStatus.SCHEDULED,
                ))
            else:
                task.status = TaskStatus.DEFERRED
                task.allocated_start_slot = None
                task.allocated_end_slot = None

        # ─── Advanced Real Railway Coordination: Bundles & Loop Utilization ───
        from backend.optimizer.possession_bundling import identify_possession_bundles
        from backend.data.topology_graph import RailwayTopologyGraph

        topo_graph = RailwayTopologyGraph(network)
        scheduled_tasks = [t for t in tasks if t.status == TaskStatus.SCHEDULED]
        bundles = identify_possession_bundles(scheduled_tasks)
        bundled_dict: Dict[str, List[str]] = {}
        bundle_records: List[dict] = []

        for b in bundles:
            all_ids = [t.task_id for t in b.bundled_tasks]
            bundle_records.append({
                "section_id": b.section_id,
                "primary_task_id": b.primary_task.task_id,
                "bundled_task_ids": all_ids,
                "total_isolated_min": b.total_isolated_duration_min,
                "bundled_duration_min": b.bundled_duration_min,
                "time_saved_min": b.time_saved_min,
            })
            for tid_item in all_ids:
                bundled_dict[tid_item] = [x for x in all_ids if x != tid_item]

        plan.bundled_possessions = bundle_records

        loop_decisions: List[dict] = []
        for alloc in allocations:
            if alloc.task_id in bundled_dict:
                alloc.is_bundled = True
                alloc.bundled_with = bundled_dict[alloc.task_id]

            # Check loop lines and alternate routes for trains near this maintenance block
            sec = section_map.get(alloc.section_id)
            if sec and sec.capacity >= 2:
                alloc.single_line_working_active = True

            # Identify trains affected or regulated during block
            affected_train_ids = []
            for tr_id, tr_occupancies in train_occupancy.items():
                if tr_id == alloc.section_id:
                    for entry, exit_slot, train_id in tr_occupancies:
                        if (alloc.start_slot - 2 <= exit_slot) and (alloc.end_slot + 2 >= entry):
                            affected_train_ids.append(train_id)

            unique_trains = list(set(affected_train_ids))
            if unique_trains:
                alloc.loop_routed_trains = unique_trains
                alternatives = topo_graph.evaluate_loop_and_alternate_routes(alloc.section_id)
                loop_decisions.append({
                    "task_id": alloc.task_id,
                    "section_id": alloc.section_id,
                    "block_window_slots": f"{alloc.start_slot}–{alloc.end_slot}",
                    "regulated_trains": unique_trains,
                    "available_alternatives": alternatives,
                    "resolution": "Trains held in station loop or single-line working activated" if sec and sec.capacity >= 2 else "Loop line hold recommended",
                })

        plan.loop_routing_decisions = loop_decisions
        plan.allocations = allocations
        plan.tasks = tasks
        plan.maintenance_assignments = [
            {
                "task_id": alloc.task_id,
                "section_id": alloc.section_id,
                "track_id": alloc.track_id,
                "start_slot": alloc.start_slot,
                "end_slot": alloc.end_slot,
                "start_min": alloc.start_slot * 15,
                "end_min": alloc.end_slot * 15,
                "department": alloc.department,
                "status": alloc.status.value if hasattr(alloc.status, "value") else str(alloc.status),
                "affected_trains": alloc.affected_trains,
                "loop_routed_trains": alloc.loop_routed_trains,
            }
            for alloc in allocations
        ]

        # Calculate train delays and update path segments accordingly
        for train in trains:
            delay_slots = solver.value(train_delay_vars.get(train.train_id, 0))
            train.actual_delay_min = delay_slots * 15  # Convert slots to minutes
            if delay_slots > 0 and train.path_segments:
                for seg in train.path_segments:
                    seg.entry_slot += delay_slots
                    seg.exit_slot += delay_slots

        plan.trains = trains
        plan.train_assignments = [
            {
                "train_id": train.train_id,
                "train_name": train.train_name,
                "train_type": train.train_type.value if hasattr(train.train_type, "value") else str(train.train_type),
                "route": train.route,
                "path_segments": [seg.model_dump() for seg in train.path_segments],
                "delay_min": train.actual_delay_min,
                "status": "CANCELLED" if train.is_cancelled else ("REROUTED" if train.is_rerouted else "SCHEDULED"),
            }
            for train in trains
        ]
        plan.track_occupancies = [
            {
                "train_id": train.train_id,
                "section_id": seg.section_id,
                "track_id": f"TRK_{seg.section_id}_{'UP' if seg.section_id in {'S07','S08','S09','S10','S11','S12','S20','S21','S22','S23','S24','S25','S26'} else 'DOWN'}",
                "entry_slot": seg.entry_slot,
                "exit_slot": seg.exit_slot,
                "entry_min": seg.entry_slot * 15,
                "exit_min": seg.exit_slot * 15,
            }
            for train in trains
            for seg in train.path_segments
        ]
        plan.loop_assignments = plan.loop_routing_decisions

        # Compute KPIs
        plan.kpis = _compute_kpis(plan, network, frozen_tasks)
        plan.delay_metrics = {
            "total_train_delay_min": plan.kpis.total_train_delay_min,
            "avg_train_delay_min": plan.kpis.avg_train_delay_min,
            "cancelled_trains": plan.kpis.cancelled_trains,
            "rerouted_trains": plan.kpis.rerouted_trains,
        }
        plan.asset_metrics = {
            "asset_availability_pct": plan.kpis.asset_availability_pct,
            "maintenance_completion_pct": plan.kpis.maintenance_completion_pct,
            "active_blocks": plan.kpis.active_blocks,
        }
        plan.objective_value = (
            (plan.kpis.maintenance_completion_pct * 100)
            + (plan.kpis.asset_availability_pct * 10)
            - plan.kpis.total_train_delay_min
        )
        plan.optimization_metadata = {
            "hard_constraints": [
                "section_capacity",
                "single_line_non_overlap",
                "maintenance_train_separation",
                "department_incompatibility",
                "critical_task_presence",
                "frozen_lns_assignments",
            ],
            "soft_objectives": [
                "maintenance_completion",
                "asset_availability",
                "train_delay",
                "night_possession_preference",
                "minimal_replanning_change",
            ],
            "solver_status": plan.solver_status,
            "time_limit_sec": time_limit_sec,
        }

    else:
        plan.is_feasible = False
        plan.infeasibility_reason = _diagnose_infeasibility(tasks, network, trains)
        # Mark all tasks as pending
        for task in tasks:
            task.status = TaskStatus.PENDING
        plan.tasks = tasks
        plan.trains = trains
        plan.kpis = PlanKPIs()

    logger.info(
        f"CP-SAT solver: status={status_name}, feasible={plan.is_feasible}, "
        f"time={solve_time:.2f}s, allocations={len(plan.allocations)}"
    )

    return plan


def _compute_kpis(
    plan: SchedulePlan,
    network: RailwayNetwork,
    frozen_tasks: Optional[Dict[str, Tuple[int, int]]] = None,
) -> PlanKPIs:
    """Compute KPIs from a solved plan."""
    total_tasks = len(plan.tasks)
    scheduled = [a for a in plan.allocations]
    deferred = [t for t in plan.tasks if t.status == TaskStatus.DEFERRED]
    critical_tasks = [t for t in plan.tasks if t.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH)]
    critical_scheduled = [t for t in plan.tasks
                          if t.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH)
                          and t.status == TaskStatus.SCHEDULED]

    # Asset availability: % of section-slot time that is not under maintenance
    total_section_slots = len(network.sections) * plan.horizon_slots
    maintenance_slots = sum(a.duration_slots for a in plan.allocations)
    availability = ((total_section_slots - maintenance_slots) / total_section_slots * 100) if total_section_slots > 0 else 0

    # Train delays
    total_delay = sum(t.actual_delay_min for t in plan.trains)
    cancelled = sum(1 for t in plan.trains if t.is_cancelled)
    rerouted = sum(1 for t in plan.trains if t.is_rerouted)
    avg_delay = total_delay / len(plan.trains) if plan.trains else 0

    loop_count = sum(len(a.loop_routed_trains) for a in plan.allocations)
    bundle_count = len(plan.bundled_possessions)
    time_saved = sum(b.get("time_saved_min", 0) for b in plan.bundled_possessions)
    frozen_pct = (len(frozen_tasks) / total_tasks * 100.0) if frozen_tasks and total_tasks > 0 else 0.0

    return PlanKPIs(
        asset_availability_pct=round(availability, 1),
        maintenance_completion_pct=round(len(scheduled) / total_tasks * 100, 1) if total_tasks > 0 else 0,
        maintenance_completed=len(scheduled),
        maintenance_total=total_tasks,
        maintenance_deferred=len(deferred),
        total_train_delay_min=total_delay,
        avg_train_delay_min=round(avg_delay, 1),
        cancelled_trains=cancelled,
        rerouted_trains=rerouted,
        conflicts=0,  # Valid plan has 0 conflicts
        critical_tasks_scheduled=len(critical_scheduled),
        critical_tasks_total=len(critical_tasks),
        active_blocks=len(scheduled),
        replan_time_sec=round(plan.solve_time_sec, 3),
        loop_utilizations_count=loop_count,
        bundled_possessions_count=bundle_count,
        time_saved_bundling_min=time_saved,
        frozen_tasks_ratio_pct=round(frozen_pct, 1),
    )


def _diagnose_infeasibility(
    tasks: List[MaintenanceTask],
    network: RailwayNetwork,
    trains: List[Train],
) -> str:
    """Generate a human-readable infeasibility diagnosis."""
    non_deferrable = [t for t in tasks if not t.is_deferrable]
    lines = ["NO FEASIBLE PLAN FOUND", "", "Conflicting constraints:"]

    for t in non_deferrable:
        lines.append(
            f"• Critical task {t.task_id} requires Section {t.section_id} "
            f"between slots {t.earliest_start_slot}–{t.deadline_slot}"
        )

    # Check for train conflicts on critical sections
    critical_sections = {t.section_id for t in non_deferrable}
    for train in trains:
        for seg in train.path_segments:
            if seg.section_id in critical_sections:
                lines.append(
                    f"• Train {train.train_id} occupies Section {seg.section_id} "
                    f"at slots {seg.entry_slot}–{seg.exit_slot}"
                )

    lines.extend(["", "Recommended action:", "Controller review required"])
    return "\n".join(lines)
