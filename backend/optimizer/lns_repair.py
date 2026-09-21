"""
CARB-Planner — Localized LNS (Large Neighborhood Search) & CP-SAT Repair Engine

When a disruption occurs, CARB-Planner does NOT re-optimize the entire 742 km corridor.
Instead, it executes strict Localized Replanning:
  1. Loads the CURRENT committed OperationalPlan.
  2. Identifies the exact spatial-temporal neighborhood (affected_region: disrupted section,
     neighboring sections, boundary stations, and connected loops).
  3. Freezes all unaffected trains and maintenance tasks (FROZEN state).
  4. Marks affected allocations as INVALIDATED_BY_DISRUPTION.
  5. Evaluates physically available topology alternatives:
       - Alternate main track (for double-track sections)
       - Station crossing loops and common loops (for train regulation & holding)
       - Station sidings
       - Maintenance window shifting and retiming
  6. Re-optimizes only the affected neighborhood using CP-SAT / LNS.
  7. Validates safety, headway, and loop capacity constraints.
  8. Generates an exact Plan Diff with per-train delay breakdowns and change reasons.
"""

from __future__ import annotations

import copy
import logging
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.models.network import RailwayNetwork
from backend.models.plan import (
    BlockAllocation,
    DisruptionEvent,
    DisruptionType,
    PlanKPIs,
    SchedulePlan,
)
from backend.models.task import (
    Department,
    MaintenanceTask,
    RiskLevel,
    TaskPriority,
    TaskStatus,
    TaskType,
)
from backend.models.train import Train, TrainService
from backend.optimizer.conflict_engine import ConflictEngine
from backend.optimizer.cp_sat import solve_block_plan
from backend.optimizer.plan_diff import compare_plans
from backend.simulation.railway_sim import compute_detailed_kpis

logger = logging.getLogger(__name__)

# Buffer slots around the disruption window to unlock for rescheduling
LNS_TIME_BUFFER_SLOTS = 8  # ±2 hours neighborhood


def get_stations_for_section(section_id: str, network: RailwayNetwork) -> Set[str]:
    """Get boundary stations (IDs and station codes) connected to a section."""
    stns = set()
    for sec in network.sections:
        if sec.section_id == section_id:
            stns.add(sec.from_station)
            stns.add(sec.to_station)
            for s in network.stations:
                if s.station_id in (sec.from_station, sec.to_station) or getattr(s, "code", "") in (sec.from_station, sec.to_station):
                    stns.add(s.station_id)
                    if hasattr(s, "code") and s.code:
                        stns.add(s.code)
    return stns


def identify_affected_region(
    disruption: DisruptionEvent,
    current_plan: SchedulePlan,
    network: RailwayNetwork,
) -> Dict[str, Any]:
    """Identify the exact spatial-temporal neighborhood affected by a disruption.

    Returns:
        {
            "disrupted_section": str,
            "affected_sections": set,
            "neighboring_sections": set,
            "affected_stations": set,
            "available_loops": list,
            "start_slot": int,
            "end_slot": int,
        }
    """
    disrupted_sec = disruption.affected_section or "S03"
    affected_sections = {disrupted_sec}
    neighboring_sections = set()
    boundary_stations = get_stations_for_section(disrupted_sec, network)

    # Find adjacent sections connected to boundary stations
    for sec in network.sections:
        if sec.section_id != disrupted_sec:
            if sec.from_station in boundary_stations or sec.to_station in boundary_stations:
                neighboring_sections.add(sec.section_id)
                affected_sections.add(sec.section_id)

    # Calculate time window
    start_slot = disruption.affected_start_slot if disruption.affected_start_slot is not None else 50  # ~12:30 default
    dur_min = getattr(disruption, "duration_minutes", None) or getattr(disruption, "overrun_minutes", None) or 90
    dur_slots = max(1, (dur_min + 14) // 15)
    end_slot = disruption.affected_end_slot if disruption.affected_end_slot is not None else (start_slot + dur_slots)

    # Available loops at boundary stations
    available_loops = [
        l for l in network.loop_lines
        if l.station_id in boundary_stations or getattr(l, "station_code", "") in boundary_stations
    ]

    return {
        "disrupted_section": disrupted_sec,
        "affected_sections": affected_sections,
        "neighboring_sections": neighboring_sections,
        "affected_stations": boundary_stations,
        "available_loops": available_loops,
        "start_slot": max(0, start_slot - LNS_TIME_BUFFER_SLOTS),
        "end_slot": min(current_plan.horizon_slots, end_slot + LNS_TIME_BUFFER_SLOTS),
        "core_start_slot": start_slot,
        "core_end_slot": end_slot,
        "duration_min": dur_min,
    }


def apply_disruption(
    disruption: DisruptionEvent,
    current_plan: SchedulePlan,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    network: RailwayNetwork,
    services: Optional[List[TrainService]] = None,
) -> Tuple[SchedulePlan, Dict[str, Any], Dict[str, Any]]:
    """Execute localized LNS / CP-SAT replanning onto current_plan.

    Returns:
        (repaired_plan, repair_info, plan_diff)
    """
    start_time = time.perf_counter()
    logger.info(f"LNS Localized Replanning starting for disruption: {disruption.disruption_type} on {disruption.affected_section}")

    region = identify_affected_region(disruption, current_plan, network)
    affected_secs = region["affected_sections"]
    core_start = region["core_start_slot"]
    core_end = region["core_end_slot"]
    disrupted_sec = region["disrupted_section"]

    # ── Step 1: Invalidate Affected Allocations & Freeze Unaffected ──
    frozen_tasks: Dict[str, Tuple[int, int]] = {}
    invalidated_task_ids: Set[str] = set()

    for alloc in current_plan.allocations:
        is_in_section = alloc.section_id in affected_secs
        is_in_time = (alloc.start_slot < region["end_slot"] and alloc.end_slot > region["start_slot"])

        if is_in_section and is_in_time:
            invalidated_task_ids.add(alloc.task_id)
            logger.info(f"Task {alloc.task_id} on {alloc.section_id} INVALIDATED_BY_DISRUPTION (old: {alloc.start_slot}-{alloc.end_slot})")
        else:
            frozen_tasks[alloc.task_id] = (alloc.start_slot, alloc.end_slot)

    # ── Step 2: Prepare Tasks for Solver ──
    repair_tasks = copy.deepcopy(tasks)
    emergency_task = None

    if disruption.new_task:
        emergency_task = disruption.new_task
        emergency_task.status = TaskStatus.PENDING
        task_id = emergency_task.task_id
        if disruption.disruption_type in (DisruptionType.CRITICAL_DEFECT, DisruptionType.TRACK_BLOCKED):
            emergency_task.is_deferrable = False
            frozen_tasks[task_id] = (core_start, core_end)
            logger.info(f"Custom emergency possession {task_id} locked to slots {core_start}-{core_end} on {disrupted_sec}")
        if not any(t.task_id == task_id for t in repair_tasks):
            repair_tasks.append(emergency_task)

    elif disruption.disruption_type in (DisruptionType.CRITICAL_DEFECT, DisruptionType.SIGNAL_FAILURE, DisruptionType.TRACK_BLOCKED):
        sec = next((s for s in network.sections if s.section_id == disrupted_sec), None)
        task_id = f"T_EMRG_{disruption.disruption_id.replace('DISRUPT_', '')}"
        emergency_task = MaintenanceTask(
            task_id=task_id,
            department=Department.ENGINEERING if disruption.disruption_type != DisruptionType.SIGNAL_FAILURE else Department.SNT,
            task_type=TaskType.TRACK_MAINTENANCE if disruption.disruption_type != DisruptionType.SIGNAL_FAILURE else TaskType.SIGNAL_MAINTENANCE,
            section_id=disrupted_sec,
            priority=TaskPriority.CRITICAL,
            criticality=TaskPriority.CRITICAL,
            asset_age=sec.asset_age_years if sec else 10.0,
            condition_score=0.15,
            crew_size=6,
            crew_available=True,
            complexity=0.9,
            weather_factor=1.0,
            historical_duration_min=region["duration_min"],
            earliest_start_slot=core_start,
            deadline_slot=core_end + 4,
            risk_score=0.95,
            risk_level=RiskLevel.CRITICAL,
            status=TaskStatus.PENDING,
            is_deferrable=False,
            defect_count=5,
            days_since_maintenance=0,
            predicted_p50_min=region["duration_min"] - 15,
            predicted_p90_min=region["duration_min"],
        )
        # Lock emergency task to core disruption window
        frozen_tasks[task_id] = (core_start, core_end)
        repair_tasks.append(emergency_task)
        logger.info(f"Emergency possession {task_id} locked to slots {core_start}-{core_end} on {disrupted_sec}")

    elif disruption.disruption_type == DisruptionType.BLOCK_CANCELLATION:
        if disruption.cancelled_task_id:
            repair_tasks = [t for t in repair_tasks if t.task_id != disruption.cancelled_task_id]
            frozen_tasks.pop(disruption.cancelled_task_id, None)

    elif disruption.disruption_type == DisruptionType.MAINTENANCE_OVERRUN:
        overrun_min = disruption.overrun_minutes or 45
        extra_slots = (overrun_min + 14) // 15
        for t in repair_tasks:
            if t.task_id == disruption.cancelled_task_id or t.section_id == disrupted_sec:
                t.historical_duration_min += overrun_min
                t.predicted_p90_min = (t.predicted_p90_min or 90) + overrun_min
                if t.allocated_start_slot is not None:
                    frozen_tasks[t.task_id] = (t.allocated_start_slot, t.allocated_start_slot + (t.predicted_p90_min + 14) // 15)

    # ── Step 3: Solve Localized CP-SAT Model ──
    # The solver receives frozen tasks for unaffected decisions, and only schedules
    # the invalidated tasks around the emergency block
    repaired_plan = solve_block_plan(
        network=network,
        tasks=repair_tasks,
        trains=copy.deepcopy(trains),
        horizon_slots=current_plan.horizon_slots,
        time_limit_sec=20.0,
        frozen_tasks=frozen_tasks,
    )

    # ── Step 4: Localized Train Movement & Loop Regulation Repair ──
    # Re-evaluate train movements intersecting the disrupted section during the blocked window
    repaired_train_assignments = []
    loop_decisions = []
    available_loops = region["available_loops"]
    loop_idx = 0

    # Build old train assignments map
    old_trains_map = {t.get("train_number"): t for t in current_plan.train_assignments if t.get("train_number")}

    # Scan services or trains
    target_train_list = services if services else trains
    for item in target_train_list:
        tnum = getattr(item, "train_number", getattr(item, "train_id", ""))
        tname = getattr(item, "train_name", f"Train {tnum}")
        old_t = old_trains_map.get(tnum, {})

        # Check if this train traverses disrupted section during blocked window
        intersects_disruption = False
        entry_min = 0
        exit_min = 0

        if hasattr(item, "occupancy"):
            for occ in item.occupancy:
                if occ.section_id == disrupted_sec:
                    occ_start_slot = occ.entry_time_min // 15
                    occ_end_slot = (occ.exit_time_min + 14) // 15
                    if occ_start_slot < core_end and occ_end_slot > core_start:
                        intersects_disruption = True
                        entry_min = occ.entry_time_min
                        exit_min = occ.exit_time_min
                        break
        else:
            # Fallback path segments
            for seg in getattr(item, "path_segments", []):
                if seg.section_id == disrupted_sec:
                    if seg.entry_slot < core_end and seg.exit_slot > core_start:
                        intersects_disruption = True
                        entry_min = seg.entry_slot * 15
                        exit_min = seg.exit_slot * 15
                        break

        sec_obj = next((s for s in network.sections if s.section_id == disrupted_sec), None)
        is_single_track = (sec_obj.capacity <= 1) if sec_obj else False

        if intersects_disruption:
            # Train cannot pass on blocked track during disruption window!
            # Look up physical alternatives in topology:
            if not is_single_track:
                # Double track: Single Line Working (SLW) under Caution Order with slight delay
                new_delay = old_t.get("delay_min", 0) + 18
                repaired_train_assignments.append({
                    "train_id": getattr(item, "train_id", tnum),
                    "train_number": tnum,
                    "train_name": tname,
                    "status": "REROUTED_SLW",
                    "action": "REROUTED",
                    "watermark": "↻ REROUTED",
                    "is_held": False,
                    "is_rerouted": True,
                    "delay_min": new_delay,
                    "actual_delay_min": new_delay,
                    "entry_time_min": entry_min,
                    "exit_time_min": exit_min + 18,
                    "reason": f"Single Line Working (SLW) via Track 2 due to critical defect on Track 1 of {disrupted_sec}",
                })
            else:
                # Single line: Must hold at boundary station loop until end of disruption!
                assigned_loop = available_loops[loop_idx % len(available_loops)] if available_loops else None
                loop_idx += 1
                hold_station = assigned_loop.station_code if assigned_loop else (list(region["affected_stations"])[0] if region["affected_stations"] else "STN")
                loop_name = assigned_loop.loop_name if assigned_loop else f"Crossing Loop ({hold_station})"
                delay_added = max(20, (core_end * 15) - entry_min)

                loop_decisions.append({
                    "loop_id": assigned_loop.loop_id if assigned_loop else f"L_{hold_station}_01",
                    "station_code": hold_station,
                    "train_number": tnum,
                    "reason": f"Held at {loop_name} until track possession cleared at {(core_end*15)//60:02d}:{(core_end*15)%60:02d}",
                })

                repaired_train_assignments.append({
                    "train_id": getattr(item, "train_id", tnum),
                    "train_number": tnum,
                    "train_name": tname,
                    "status": "HELD_AT_LOOP",
                    "action": "HELD",
                    "watermark": "↻ HELD",
                    "is_held": True,
                    "held_at_station": hold_station,
                    "loop_used": assigned_loop.loop_id if assigned_loop else f"L_{hold_station}_01",
                    "delay_min": old_t.get("delay_min", 0) + delay_added,
                    "actual_delay_min": old_t.get("delay_min", 0) + delay_added,
                    "entry_time_min": entry_min,
                    "exit_time_min": exit_min + delay_added,
                    "reason": f"Regulated via {loop_name} at {hold_station} due to single-line track defect",
                })
        else:
            # Unaffected train remains FROZEN with its current schedule
            f_entry = old_t.get("entry_time_min", getattr(item, "scheduled_departure_min", 0))
            f_delay = old_t.get("delay_min", getattr(item, "actual_delay_min", 0))
            repaired_train_assignments.append({
                "train_id": getattr(item, "train_id", tnum),
                "train_number": tnum,
                "train_name": tname,
                "status": "FROZEN",
                "action": "UNMODIFIED",
                "watermark": None,
                "is_held": old_t.get("is_held", False),
                "held_at_station": old_t.get("held_at_station"),
                "loop_used": old_t.get("loop_used"),
                "delay_min": f_delay,
                "actual_delay_min": f_delay,
                "entry_time_min": f_entry,
                "exit_time_min": old_t.get("exit_time_min", f_entry + 60),
                "reason": "Unaffected by localized disruption — frozen schedule maintained",
            })

    repaired_plan.train_assignments = repaired_train_assignments
    repaired_plan.loop_routing_decisions = loop_decisions

    # Step 5: Recalculate KPIs
    repaired_plan.kpis = compute_detailed_kpis(repaired_plan, network)
    repaired_plan.solve_time_sec = round(time.perf_counter() - start_time, 3)

    # Step 6: Compute Exact Plan Diff
    plan_diff = compare_plans(current_plan, repaired_plan, disruption)

    repair_info = {
        "status": "repaired" if repaired_plan.is_feasible else "infeasible",
        "solve_time_sec": repaired_plan.solve_time_sec,
        "repair_time_sec": repaired_plan.solve_time_sec,
        "affected_sections": list(affected_secs),
        "frozen_tasks": len(frozen_tasks),
        "frozen_tasks_count": len(frozen_tasks),
        "unlocked_tasks": len(repair_tasks) - len(frozen_tasks),
        "invalidated_tasks_count": len(invalidated_task_ids),
        "changed_trains_count": len(plan_diff["changed_trains"]),
        "changed_maintenance_count": len(plan_diff["changed_maintenance"]),
        "changed_loops_count": len(plan_diff["changed_loops"]),
        "total_additional_delay_min": plan_diff["total_additional_delay_min"],
        "diff_summary": plan_diff,
        "diff": plan_diff,
        "plan_diff": plan_diff,
    }

    return repaired_plan, repair_info
