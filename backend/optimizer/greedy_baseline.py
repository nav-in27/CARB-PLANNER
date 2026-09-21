"""
CARB-Planner — Greedy Baseline Scheduler

A simple priority-based greedy scheduler for baseline comparison.
Sorts tasks by priority and assigns earliest feasible slot.
Does NOT perform joint optimization, lookahead, or train-path awareness.

This demonstrates why a real constrained optimizer (CP-SAT) is needed.
"""

from __future__ import annotations

import copy
import time
from typing import Dict, List, Set, Tuple

from backend.models.network import RailwayNetwork, Section
from backend.models.plan import BlockAllocation, PlanKPIs, SchedulePlan
from backend.models.task import MaintenanceTask, TaskPriority, TaskStatus
from backend.models.train import Train


# Priority ordering for sorting
PRIORITY_ORDER = {
    TaskPriority.CRITICAL: 0,
    TaskPriority.HIGH: 1,
    TaskPriority.MEDIUM: 2,
    TaskPriority.LOW: 3,
}


def solve_greedy(
    network: RailwayNetwork,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    horizon_slots: int = 96,
) -> SchedulePlan:
    """Greedy baseline: sort by priority, assign earliest feasible slot.

    No train conflict avoidance. No department incompatibility.
    Just simple sequential slot allocation.
    """
    start_time = time.perf_counter()

    tasks = copy.deepcopy(tasks)
    trains = copy.deepcopy(trains)

    # Sort tasks: Critical first, then High, Medium, Low
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.priority, 3))

    # Track occupied slots per section: section_id -> set of occupied slot indices
    section_occupied: Dict[str, Set[int]] = {s.section_id: set() for s in network.sections}

    # Mark train-occupied slots
    for train in trains:
        for seg in train.path_segments:
            for slot in range(seg.entry_slot, seg.exit_slot):
                if slot < horizon_slots:
                    section_occupied.setdefault(seg.section_id, set()).add(slot)

    allocations: List[BlockAllocation] = []
    conflicts = 0

    for task in sorted_tasks:
        p90_min = task.predicted_p90_min or task.historical_duration_min
        dur_slots = max(1, (p90_min + 14) // 15)

        earliest = max(0, task.earliest_start_slot)
        deadline = min(task.deadline_slot, horizon_slots)

        # Find first feasible starting slot
        placed = False
        for start in range(earliest, deadline - dur_slots + 1):
            end = start + dur_slots
            # Check if all slots are free
            occupied = section_occupied.get(task.section_id, set())
            if any(s in occupied for s in range(start, end)):
                continue

            # Place the task
            for s in range(start, end):
                occupied.add(s)
            section_occupied[task.section_id] = occupied

            task.status = TaskStatus.SCHEDULED
            task.allocated_start_slot = start
            task.allocated_end_slot = end

            allocations.append(BlockAllocation(
                task_id=task.task_id,
                section_id=task.section_id,
                start_slot=start,
                end_slot=end,
                duration_slots=dur_slots,
                department=task.department.value,
                status=TaskStatus.SCHEDULED,
            ))
            placed = True
            break

        if not placed:
            task.status = TaskStatus.DEFERRED
            if not task.is_deferrable:
                conflicts += 1  # Critical task deferred = conflict!

    solve_time = time.perf_counter() - start_time

    # Check for train/maintenance overlaps (greedy doesn't avoid these)
    for alloc in allocations:
        for train in trains:
            for seg in train.path_segments:
                if seg.section_id == alloc.section_id:
                    if alloc.start_slot < seg.exit_slot and alloc.end_slot > seg.entry_slot:
                        conflicts += 1
                        # Simple delay calculation
                        overlap = min(alloc.end_slot, seg.exit_slot) - max(alloc.start_slot, seg.entry_slot)
                        train.actual_delay_min += overlap * 15

    plan = SchedulePlan(
        plan_id="greedy_baseline",
        horizon_slots=horizon_slots,
        allocations=allocations,
        tasks=sorted_tasks,
        trains=trains,
        solver_status="GREEDY",
        solve_time_sec=round(solve_time, 3),
        is_feasible=True,
    )

    # Compute KPIs
    total_section_slots = len(network.sections) * horizon_slots
    maint_slots = sum(a.duration_slots for a in allocations)
    availability = ((total_section_slots - maint_slots) / total_section_slots * 100) if total_section_slots > 0 else 0

    total_delay = sum(t.actual_delay_min for t in trains)
    deferred_count = sum(1 for t in sorted_tasks if t.status == TaskStatus.DEFERRED)
    critical_tasks = [t for t in sorted_tasks if t.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH)]
    critical_done = [t for t in critical_tasks if t.status == TaskStatus.SCHEDULED]

    plan.kpis = PlanKPIs(
        asset_availability_pct=round(availability, 1),
        maintenance_completion_pct=round(len(allocations) / len(sorted_tasks) * 100, 1) if sorted_tasks else 0,
        maintenance_completed=len(allocations),
        maintenance_total=len(sorted_tasks),
        maintenance_deferred=deferred_count,
        total_train_delay_min=total_delay,
        avg_train_delay_min=round(total_delay / len(trains), 1) if trains else 0,
        cancelled_trains=0,
        conflicts=conflicts,
        critical_tasks_scheduled=len(critical_done),
        critical_tasks_total=len(critical_tasks),
        active_blocks=len(allocations),
        replan_time_sec=round(solve_time, 3),
    )

    return plan
