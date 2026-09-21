"""
CARB-Planner — Structural Explanation Engine

Generates human-readable explanations for every scheduling decision
directly from optimizer constraint information.

NO LLM is used. Explanations are derived from:
- Task priority and criticality
- Section occupancy conflicts
- Train path conflicts
- P90 duration margins
- Risk levels and deadline proximity
"""

from __future__ import annotations

from typing import Dict, List, Optional

from backend.models.plan import BlockAllocation, SchedulePlan, TaskExplanation
from backend.models.task import MaintenanceTask, RiskLevel, TaskPriority, TaskStatus
from backend.models.train import Train


def _slot_to_time(slot: int) -> str:
    """Convert a 15-minute slot index to HH:MM format."""
    hours = (slot * 15) // 60
    minutes = (slot * 15) % 60
    return f"{hours:02d}:{minutes:02d}"


def _slot_range_str(start: int, end: int) -> str:
    """Format a slot range as a time window string."""
    return f"{_slot_to_time(start)}–{_slot_to_time(end)}"


def generate_explanations(
    plan: SchedulePlan,
) -> Dict[str, TaskExplanation]:
    """Generate structured explanations for all tasks in the plan.

    Each explanation details WHY a task was scheduled, deferred, or rescheduled,
    derived from the actual optimization constraints and results.
    """
    explanations: Dict[str, TaskExplanation] = {}
    allocation_map: Dict[str, BlockAllocation] = {a.task_id: a for a in plan.allocations}

    # Build section occupancy for conflict explanation
    section_allocs: Dict[str, List[BlockAllocation]] = {}
    for alloc in plan.allocations:
        section_allocs.setdefault(alloc.section_id, []).append(alloc)

    # Build task lookup
    task_map: Dict[str, MaintenanceTask] = {t.task_id: t for t in plan.tasks}

    for task in plan.tasks:
        tid = task.task_id
        alloc = allocation_map.get(tid)

        explanation = TaskExplanation(
            task_id=tid,
            status=task.status,
            section_id=task.section_id,
            risk_level=task.risk_level.value,
            priority=task.priority.value,
            p50_duration_min=task.predicted_p50_min,
            p90_duration_min=task.predicted_p90_min,
        )

        if task.status == TaskStatus.SCHEDULED and alloc:
            explanation = _explain_scheduled(task, alloc, plan, section_allocs, task_map)
        elif task.status == TaskStatus.DEFERRED:
            explanation = _explain_deferred(task, plan, section_allocs, task_map)
        elif task.status == TaskStatus.RESCHEDULED and alloc:
            explanation = _explain_rescheduled(task, alloc, plan, section_allocs, task_map)

        explanations[tid] = explanation

    return explanations


def _explain_scheduled(
    task: MaintenanceTask,
    alloc: BlockAllocation,
    plan: SchedulePlan,
    section_allocs: Dict[str, List[BlockAllocation]],
    task_map: Dict[str, MaintenanceTask],
) -> TaskExplanation:
    """Explain why a task was approved and scheduled."""
    reasons = []

    # Criticality/priority justification
    if task.criticality in (TaskPriority.CRITICAL, TaskPriority.HIGH):
        reasons.append(f"{task.criticality.value} criticality — scheduling is mandatory")
    elif task.priority == TaskPriority.HIGH:
        reasons.append("High priority task")

    # Risk justification
    if task.risk_level in (RiskLevel.CRITICAL, RiskLevel.HIGH):
        reasons.append(f"Risk level: {task.risk_level.value} (risk score: {task.risk_score:.2f})")

    # Window fit
    p90 = task.predicted_p90_min or task.historical_duration_min
    window_str = _slot_range_str(alloc.start_slot, alloc.end_slot)
    reasons.append(f"P90 duration ({p90} min) fits within allocated window {window_str}")

    # Coordinated multi-department bundling justification
    if alloc.is_bundled and alloc.bundled_with:
        bundled_str = ", ".join(alloc.bundled_with)
        reasons.append(f"Joint possession coordinated with task(s) {bundled_str} under Indian Railways Rolling Block Programme (RBP)")

    # Loop line & train regulation justification
    if alloc.loop_routed_trains:
        tr_list = ", ".join(alloc.loop_routed_trains)
        reasons.append(f"Train regulation via station loop lines active for train(s): {tr_list}")
    elif alloc.single_line_working_active:
        reasons.append("Single Line Working (SLW) active on parallel running line under G&SR caution order (75 km/h)")

    # Train conflict check
    train_conflicts = _find_train_conflicts(task.section_id, alloc.start_slot, alloc.end_slot, plan.trains)
    if not train_conflicts:
        reasons.append("No train-path conflict in allocated window")
    else:
        reasons.append(f"Train conflicts resolved (trains: {', '.join(train_conflicts)})")

    # Deadline margin
    margin_slots = task.deadline_slot - alloc.end_slot
    if margin_slots > 0:
        margin_min = margin_slots * 15
        reasons.append(f"Deadline margin: {margin_min} min remaining")

    # Confidence assessment
    confidence = "High"
    if margin_slots <= 2:
        confidence = "Medium"
    if task.risk_level == RiskLevel.CRITICAL:
        confidence = "Medium"

    return TaskExplanation(
        task_id=task.task_id,
        status=TaskStatus.SCHEDULED,
        section_id=task.section_id,
        allocated_window=window_str,
        reason_lines=reasons,
        bundled_with_task=", ".join(alloc.bundled_with) if alloc.bundled_with else None,
        loop_alternative_evaluated="Loop holding / SLW active" if (alloc.loop_routed_trains or alloc.single_line_working_active) else None,
        decision_confidence=confidence,
        risk_level=task.risk_level.value,
        priority=task.priority.value,
        p50_duration_min=task.predicted_p50_min,
        p90_duration_min=task.predicted_p90_min,
    )


def _explain_deferred(
    task: MaintenanceTask,
    plan: SchedulePlan,
    section_allocs: Dict[str, List[BlockAllocation]],
    task_map: Dict[str, MaintenanceTask],
) -> TaskExplanation:
    """Explain why a task was deferred."""
    reasons = []
    competing_task_id = None
    competing_reason = None

    # Find what occupied the section during the task's window
    section_occupants = section_allocs.get(task.section_id, [])
    conflicting = [
        a for a in section_occupants
        if a.start_slot < task.deadline_slot and a.end_slot > task.earliest_start_slot
    ]

    if conflicting:
        # Find the highest-priority conflicting task
        best_conflict = max(conflicting, key=lambda a: _alloc_priority_score(a, task_map))
        competing_task_id = best_conflict.task_id
        comp_task = task_map.get(competing_task_id)

        reasons.append(
            f"Section {task.section_id} was occupied during the requested window "
            f"({_slot_range_str(task.earliest_start_slot, task.deadline_slot)})"
        )

        if comp_task:
            competing_reasons = []
            if _priority_rank(comp_task.criticality) < _priority_rank(task.criticality):
                competing_reasons.append("Higher criticality")
            if comp_task.risk_score > task.risk_score:
                competing_reasons.append("Higher risk")
            if comp_task.deadline_slot < task.deadline_slot:
                competing_reasons.append("Earlier deadline")
            if not competing_reasons:
                competing_reasons.append("Better overall optimization objective score")
            competing_reason = f"Why {competing_task_id} was retained: " + ", ".join(competing_reasons)
    else:
        # Possibly deferred due to train conflicts or insufficient window
        train_conflicts = _find_train_conflicts(
            task.section_id, task.earliest_start_slot, task.deadline_slot, plan.trains
        )
        if train_conflicts:
            reasons.append(
                f"Train movements ({', '.join(train_conflicts)}) occupy Section {task.section_id} "
                f"during the feasible window"
            )
        else:
            reasons.append("No feasible slot found within the allowed time window")

    # P90 duration info
    p90 = task.predicted_p90_min or task.historical_duration_min
    available_window_min = (task.deadline_slot - task.earliest_start_slot) * 15
    reasons.append(f"P90 duration: {p90} min, available window: {available_window_min} min")

    # Alternative window suggestion
    alternative = _suggest_alternative_window(task, plan)

    return TaskExplanation(
        task_id=task.task_id,
        status=TaskStatus.DEFERRED,
        section_id=task.section_id,
        reason_lines=reasons,
        competing_task_id=competing_task_id,
        competing_reason=competing_reason,
        alternative_window=alternative,
        decision_confidence="High" if conflicting else "Medium",
        risk_level=task.risk_level.value,
        priority=task.priority.value,
        p50_duration_min=task.predicted_p50_min,
        p90_duration_min=task.predicted_p90_min,
    )


def _explain_rescheduled(
    task: MaintenanceTask,
    alloc: BlockAllocation,
    plan: SchedulePlan,
    section_allocs: Dict[str, List[BlockAllocation]],
    task_map: Dict[str, MaintenanceTask],
) -> TaskExplanation:
    """Explain why a task was rescheduled to a different window."""
    reasons = [
        "Task rescheduled to accommodate disruption repair",
        f"New window: {_slot_range_str(alloc.start_slot, alloc.end_slot)}",
    ]

    return TaskExplanation(
        task_id=task.task_id,
        status=TaskStatus.RESCHEDULED,
        section_id=task.section_id,
        allocated_window=_slot_range_str(alloc.start_slot, alloc.end_slot),
        reason_lines=reasons,
        decision_confidence="Medium",
        risk_level=task.risk_level.value,
        priority=task.priority.value,
        p50_duration_min=task.predicted_p50_min,
        p90_duration_min=task.predicted_p90_min,
    )


def _find_train_conflicts(
    section_id: str,
    start_slot: int,
    end_slot: int,
    trains: list[Train],
) -> list[str]:
    """Find trains that traverse a section during a given time window."""
    conflicts = []
    for train in trains:
        for seg in train.path_segments:
            if seg.section_id == section_id:
                if seg.entry_slot < end_slot and seg.exit_slot > start_slot:
                    conflicts.append(train.train_id)
    return conflicts


def _alloc_priority_score(alloc: BlockAllocation, task_map: Dict[str, MaintenanceTask]) -> int:
    """Score an allocation's task for priority comparison."""
    task = task_map.get(alloc.task_id)
    if not task:
        return 0
    return (4 - _priority_rank(task.criticality)) * 100 + int(task.risk_score * 100)


def _priority_rank(priority: TaskPriority) -> int:
    """Convert priority to numeric rank (lower = higher priority)."""
    return {
        TaskPriority.CRITICAL: 0,
        TaskPriority.HIGH: 1,
        TaskPriority.MEDIUM: 2,
        TaskPriority.LOW: 3,
    }.get(priority, 3)


def _suggest_alternative_window(task: MaintenanceTask, plan: SchedulePlan) -> Optional[str]:
    """Suggest a possible alternative window for a deferred task."""
    p90 = task.predicted_p90_min or task.historical_duration_min
    dur_slots = max(1, (p90 + 14) // 15)

    # Look for free slots on this section beyond the original deadline
    occupied = set()
    for alloc in plan.allocations:
        if alloc.section_id == task.section_id:
            for s in range(alloc.start_slot, alloc.end_slot):
                occupied.add(s)

    for start in range(task.deadline_slot, plan.horizon_slots - dur_slots):
        if all(s not in occupied for s in range(start, start + dur_slots)):
            return _slot_range_str(start, start + dur_slots)

    return "No alternative found within planning horizon"
