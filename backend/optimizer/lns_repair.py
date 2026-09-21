"""
CARB-Planner — Localized LNS (Large Neighborhood Search) Repair

When a disruption occurs, we do NOT recompute the entire 7-day plan.
Instead:
  1. Load the previous feasible plan
  2. Identify the affected section/time window
  3. Freeze unaffected decisions
  4. Unlock tasks around the affected area
  5. Re-run CP-SAT only on the affected neighborhood
  6. Generate the repaired plan
  7. Compare old vs new plan

This produces faster replanning with minimal schedule disruption.
"""

from __future__ import annotations

import copy
import logging
import time
from typing import Dict, List, Optional, Tuple

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
)
from backend.models.train import Train
from backend.optimizer.cp_sat import solve_block_plan

logger = logging.getLogger(__name__)

# How many extra slots around the disruption to unlock
LNS_TIME_BUFFER_SLOTS = 8  # ±2 hours neighborhood


def identify_affected_neighborhood(
    disruption: DisruptionEvent,
    current_plan: SchedulePlan,
    network: RailwayNetwork,
) -> Tuple[set, int, int]:
    """Identify the spatial-temporal neighborhood affected by a disruption.

    Returns:
        (affected_section_ids, affected_start_slot, affected_end_slot)
    """
    affected_sections = {disruption.affected_section}
    start_slot = disruption.affected_start_slot or 0
    end_slot = disruption.affected_end_slot or current_plan.horizon_slots
    if disruption.disruption_type == DisruptionType.MAINTENANCE_OVERRUN and disruption.overrun_minutes:
        end_slot += max(1, (disruption.overrun_minutes + 14) // 15)

    # Expand to adjacent sections
    for sec in network.sections:
        if sec.from_station in _stations_for_section(disruption.affected_section, network) or \
           sec.to_station in _stations_for_section(disruption.affected_section, network):
            affected_sections.add(sec.section_id)

    # Add time buffer
    start_slot = max(0, start_slot - LNS_TIME_BUFFER_SLOTS)
    end_slot = min(current_plan.horizon_slots, end_slot + LNS_TIME_BUFFER_SLOTS)

    return affected_sections, start_slot, end_slot


def _stations_for_section(section_id: str, network: RailwayNetwork) -> set:
    """Get the stations connected to a section."""
    for sec in network.sections:
        if sec.section_id == section_id:
            return {sec.from_station, sec.to_station}
    return set()


def build_frozen_decisions(
    current_plan: SchedulePlan,
    affected_sections: set,
    affected_start: int,
    affected_end: int,
) -> Dict[str, Tuple[int, int]]:
    """Determine which tasks should be frozen (kept at their current allocation).

    A task is frozen if it is:
    - Not on an affected section, OR
    - Not overlapping with the affected time window
    """
    frozen: Dict[str, Tuple[int, int]] = {}

    for alloc in current_plan.allocations:
        # Check if this allocation is outside the affected neighborhood
        is_affected_section = alloc.section_id in affected_sections
        is_affected_time = (alloc.start_slot < affected_end and alloc.end_slot > affected_start)

        if not (is_affected_section and is_affected_time):
            # This task is unaffected — freeze it
            frozen[alloc.task_id] = (alloc.start_slot, alloc.end_slot)

    return frozen


def apply_disruption(
    disruption: DisruptionEvent,
    current_plan: SchedulePlan,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    network: RailwayNetwork,
) -> Tuple[SchedulePlan, Dict]:
    """Apply a disruption and run localized LNS repair.

    Returns:
        (repaired_plan, repair_info_dict)
    """
    repair_start = time.perf_counter()

    # Save pre-disruption KPIs for comparison
    before_kpis = current_plan.kpis.model_copy() if current_plan.kpis else PlanKPIs()

    # Deep copy tasks to avoid mutating original
    repair_tasks = copy.deepcopy(tasks)

    # ── Handle disruption type ──
    if disruption.disruption_type == DisruptionType.CRITICAL_DEFECT:
        # Add the new emergency task
        if disruption.new_task:
            new_task = disruption.new_task
            new_task.status = TaskStatus.PENDING
            new_task.is_deferrable = False  # Critical defect cannot be deferred
            repair_tasks.append(new_task)
            logger.info(f"Injected critical defect task {new_task.task_id} on {new_task.section_id}")

    elif disruption.disruption_type == DisruptionType.BLOCK_CANCELLATION:
        # Remove the cancelled block's allocation
        if disruption.cancelled_task_id:
            for t in repair_tasks:
                if t.task_id == disruption.cancelled_task_id:
                    t.status = TaskStatus.PENDING
                    t.allocated_start_slot = None
                    t.allocated_end_slot = None
                    logger.info(f"Cancelled block for task {t.task_id}")
                    break

    elif disruption.disruption_type == DisruptionType.DEPARTMENT_CONFLICT:
        # Both conflicting tasks are already in the task list;
        # the optimizer will resolve the conflict
        logger.info(f"Department conflict on section {disruption.affected_section}")

    elif disruption.disruption_type == DisruptionType.MAINTENANCE_OVERRUN:
        overrun_min = disruption.overrun_minutes or 45
        target_tid = disruption.cancelled_task_id or (disruption.new_task.task_id if disruption.new_task else None)
        for t in repair_tasks:
            if t.task_id == target_tid or t.section_id == disruption.affected_section:
                t.predicted_p90_min = (t.predicted_p90_min or t.historical_duration_min) + overrun_min
                t.historical_duration_min += overrun_min
                logger.info(f"Extended duration for task {t.task_id} by {overrun_min}m (overrun)")
                break

    # ── Identify affected neighborhood ──
    affected_sections, affected_start, affected_end = identify_affected_neighborhood(
        disruption, current_plan, network
    )

    # ── Build frozen decisions ──
    frozen = build_frozen_decisions(current_plan, affected_sections, affected_start, affected_end)

    unlocked_count = len(repair_tasks) - len(frozen)
    logger.info(
        f"LNS Repair: affected_sections={affected_sections}, "
        f"window=[{affected_start}, {affected_end}], "
        f"frozen={len(frozen)}, unlocked={unlocked_count}"
    )

    # ── Run CP-SAT on the affected neighborhood ──
    repaired_plan = solve_block_plan(
        network=network,
        tasks=repair_tasks,
        trains=trains,
        horizon_slots=current_plan.horizon_slots,
        time_limit_sec=30.0,
        frozen_tasks=frozen,
    )

    repair_time = time.perf_counter() - repair_start
    repaired_plan.solve_time_sec = round(repair_time, 3)
    if repaired_plan.kpis:
        repaired_plan.kpis.replan_time_sec = round(repair_time, 3)

    # ── Build repair info for comparison ──
    repair_info = {
        "disruption": disruption.model_dump(),
        "affected_sections": list(affected_sections),
        "affected_time_window": [affected_start, affected_end],
        "frozen_tasks": len(frozen),
        "unlocked_tasks": unlocked_count,
        "repair_time_sec": round(repair_time, 3),
        "before_kpis": before_kpis.model_dump(),
        "after_kpis": repaired_plan.kpis.model_dump() if repaired_plan.kpis else {},
        "is_feasible": repaired_plan.is_feasible,
    }

    return repaired_plan, repair_info
