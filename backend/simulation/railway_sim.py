"""
CARB-Planner — Railway Simulation & KPI Engine

Discrete-event simulation of the optimized schedule.
Computes exact operational metrics:
  - Asset Availability %
  - Maintenance Completion Rate
  - Total & Average Train Delay
  - Cancelled / Rerouted Trains
  - Conflict Count

Also supports ablation experiments by running the optimizer
with different configurations and comparing results.
"""

from __future__ import annotations

import copy
import logging
from typing import Dict, List, Optional

from backend.models.network import RailwayNetwork
from backend.models.plan import PlanKPIs, SchedulePlan
from backend.models.task import MaintenanceTask, TaskPriority, TaskStatus
from backend.models.train import Train
from backend.optimizer.cp_sat import solve_block_plan
from backend.optimizer.greedy_baseline import solve_greedy

logger = logging.getLogger(__name__)


def compute_detailed_kpis(
    plan: SchedulePlan,
    network: RailwayNetwork,
) -> PlanKPIs:
    """Compute detailed KPIs from a solved plan with train delay simulation."""
    total_sections = len(network.sections)
    horizon = plan.horizon_slots

    # Asset availability: percentage of section-time NOT under maintenance
    total_section_slots = total_sections * horizon
    maintenance_slots = sum(a.duration_slots for a in plan.allocations)
    availability = ((total_section_slots - maintenance_slots) / total_section_slots * 100) if total_section_slots > 0 else 100.0

    # Maintenance stats
    total_tasks = len(plan.tasks)
    scheduled = sum(1 for t in plan.tasks if t.status == TaskStatus.SCHEDULED)
    deferred = sum(1 for t in plan.tasks if t.status == TaskStatus.DEFERRED)

    # Critical task stats
    critical_total = sum(1 for t in plan.tasks
                         if t.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH))
    critical_scheduled = sum(1 for t in plan.tasks
                             if t.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH)
                             and t.status == TaskStatus.SCHEDULED)

    # Simulate train delays
    total_delay, cancelled, conflicts = _simulate_train_delays(plan, network)

    return PlanKPIs(
        asset_availability_pct=round(availability, 1),
        maintenance_completion_pct=round(scheduled / total_tasks * 100, 1) if total_tasks > 0 else 0,
        maintenance_completed=scheduled,
        maintenance_total=total_tasks,
        maintenance_deferred=deferred,
        total_train_delay_min=total_delay,
        avg_train_delay_min=round(total_delay / len(plan.trains), 1) if plan.trains else 0,
        cancelled_trains=cancelled,
        rerouted_trains=0,
        conflicts=conflicts,
        critical_tasks_scheduled=critical_scheduled,
        critical_tasks_total=critical_total,
        active_blocks=scheduled,
        replan_time_sec=plan.solve_time_sec,
    )


def _simulate_train_delays(plan: SchedulePlan, network: RailwayNetwork) -> tuple:
    """Simulate train movement through the scheduled plan and calculate delays.

    Returns: (total_delay_min, cancelled_count, conflict_count)
    """
    total_delay = 0
    cancelled = 0
    conflicts = 0

    # Build section occupancy from allocations
    section_occupied: Dict[str, set] = {}
    for alloc in plan.allocations:
        slots = set(range(alloc.start_slot, alloc.end_slot))
        section_occupied.setdefault(alloc.section_id, set()).update(slots)

    for train in plan.trains:
        train_delay = 0
        for seg in train.path_segments:
            occupied = section_occupied.get(seg.section_id, set())
            # Check overlap
            overlap_slots = occupied & set(range(seg.entry_slot, seg.exit_slot))
            if overlap_slots:
                section = next((s for s in network.sections if s.section_id == seg.section_id), None)
                if section and section.capacity > 1:
                    # Double track: trains and maintenance use different tracks — no delay
                    pass
                else:
                    # Single track: full delay from overlap
                    delay = len(overlap_slots) * 15
                    train_delay += delay
                    conflicts += 1

        train.actual_delay_min = train_delay
        total_delay += train_delay

        if train_delay > 120:  # More than 2 hours delay = effective cancellation
            train.is_cancelled = True
            cancelled += 1

    return total_delay, cancelled, conflicts


def run_ablation_experiment(
    network: RailwayNetwork,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    horizon_slots: int = 96,
) -> Dict[str, Dict]:
    """Run ablation experiments comparing CARB variants.

    Compares:
    1. Full CARB-Planner (P90 + risk weighting)
    2. Without P90 duration (uses P50/mean instead)
    3. Without risk weighting (all tasks equal weight)
    4. Greedy baseline (no optimization)

    Returns dict of config_name -> {kpis, solve_time}
    """
    results = {}

    # 1. Full CARB (baseline)
    full_tasks = copy.deepcopy(tasks)
    full_trains = copy.deepcopy(trains)
    full_plan = solve_block_plan(network, full_tasks, full_trains, horizon_slots)
    if full_plan.is_feasible:
        full_plan.kpis = compute_detailed_kpis(full_plan, network)
    results["Full CARB-Planner"] = {
        "kpis": full_plan.kpis.model_dump() if full_plan.kpis else {},
        "solve_time": full_plan.solve_time_sec,
        "feasible": full_plan.is_feasible,
    }

    # 2. Without P90 (use P50 instead)
    no_p90_tasks = copy.deepcopy(tasks)
    for t in no_p90_tasks:
        t.predicted_p90_min = t.predicted_p50_min or int(t.historical_duration_min * 0.85)
    no_p90_trains = copy.deepcopy(trains)
    no_p90_plan = solve_block_plan(network, no_p90_tasks, no_p90_trains, horizon_slots)
    if no_p90_plan.is_feasible:
        no_p90_plan.kpis = compute_detailed_kpis(no_p90_plan, network)
    results["Without P90 Duration"] = {
        "kpis": no_p90_plan.kpis.model_dump() if no_p90_plan.kpis else {},
        "solve_time": no_p90_plan.solve_time_sec,
        "feasible": no_p90_plan.is_feasible,
    }

    # 3. Without risk weighting (all tasks get medium risk)
    no_risk_tasks = copy.deepcopy(tasks)
    for t in no_risk_tasks:
        t.risk_score = 0.3
        from backend.models.task import RiskLevel
        t.risk_level = RiskLevel.MEDIUM
    no_risk_trains = copy.deepcopy(trains)
    no_risk_plan = solve_block_plan(network, no_risk_tasks, no_risk_trains, horizon_slots)
    if no_risk_plan.is_feasible:
        no_risk_plan.kpis = compute_detailed_kpis(no_risk_plan, network)
    results["Without Risk Weighting"] = {
        "kpis": no_risk_plan.kpis.model_dump() if no_risk_plan.kpis else {},
        "solve_time": no_risk_plan.solve_time_sec,
        "feasible": no_risk_plan.is_feasible,
    }

    # 4. Greedy baseline
    greedy_tasks = copy.deepcopy(tasks)
    greedy_trains = copy.deepcopy(trains)
    greedy_plan = solve_greedy(network, greedy_tasks, greedy_trains, horizon_slots)
    greedy_plan.kpis = compute_detailed_kpis(greedy_plan, network)
    results["Greedy Baseline"] = {
        "kpis": greedy_plan.kpis.model_dump() if greedy_plan.kpis else {},
        "solve_time": greedy_plan.solve_time_sec,
        "feasible": greedy_plan.is_feasible,
    }

    return results
