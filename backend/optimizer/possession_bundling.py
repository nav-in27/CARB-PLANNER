"""
CARB-Planner — Multi-Department Possession Bundling Engine

Optimizes joint maintenance possessions across Engineering, S&T, and Electrical (OHE).
Implements Indian Railways Railway Board 26-week Rolling Block Programme (RBP) principles:
"Complete all compatible departmental work during a single coordinated traffic block."
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Set, Tuple

from backend.models.task import Department, MaintenanceTask, TaskPriority, TaskStatus, TaskType

logger = logging.getLogger(__name__)

# Departments that can safely work concurrently under safety supervision
COMPATIBLE_BUNDLING_PAIRS: Set[Tuple[Department, Department]] = {
    # Engineering track tamping can be coordinated with S&T point machine check
    (Department.ENGINEERING, Department.SNT),
    (Department.SNT, Department.ENGINEERING),
    # OHE catenary adjustment can share possession with non-destructive track inspection
    (Department.ELECTRICAL, Department.ENGINEERING),
    (Department.ENGINEERING, Department.ELECTRICAL),
}


class PossessionBundle:
    """A bundled multi-department possession window."""

    def __init__(self, section_id: str, primary_task: MaintenanceTask):
        self.section_id = section_id
        self.primary_task = primary_task
        self.bundled_tasks: List[MaintenanceTask] = [primary_task]
        self.total_isolated_duration_min: int = primary_task.predicted_p90_min or primary_task.historical_duration_min
        self.bundled_duration_min: int = self.total_isolated_duration_min

    def can_bundle(self, candidate: MaintenanceTask) -> bool:
        """Check if candidate task is compatible and window-aligned."""
        if candidate.section_id != self.section_id:
            return False

        # Check department compatibility
        dept_a = self.primary_task.department
        dept_b = candidate.department

        if dept_a != dept_b and (dept_a, dept_b) not in COMPATIBLE_BUNDLING_PAIRS:
            return False

        # Check window overlap
        overlap_earliest = max(self.primary_task.earliest_start_slot, candidate.earliest_start_slot)
        overlap_latest = min(self.primary_task.deadline_slot, candidate.deadline_slot)

        cand_dur_slots = max(1, ((candidate.predicted_p90_min or candidate.historical_duration_min) + 14) // 15)
        if overlap_latest - overlap_earliest < cand_dur_slots:
            return False

        return True

    def add_task(self, candidate: MaintenanceTask):
        """Add task to bundle and compute coordinated duration."""
        self.bundled_tasks.append(candidate)
        cand_dur = candidate.predicted_p90_min or candidate.historical_duration_min
        self.total_isolated_duration_min += cand_dur
        # In a bundled possession, tasks run concurrently with a 15-minute staggered safety buffer
        self.bundled_duration_min = max(self.bundled_duration_min, cand_dur + 15)

    @property
    def time_saved_min(self) -> int:
        """Total network disruption minutes saved by combining into one block."""
        return max(0, self.total_isolated_duration_min - self.bundled_duration_min)


def identify_possession_bundles(tasks: List[MaintenanceTask]) -> List[PossessionBundle]:
    """Analyze pending maintenance requests and construct optimal multi-department bundles."""
    # Group tasks by section
    by_section: Dict[str, List[MaintenanceTask]] = {}
    for t in tasks:
        by_section.setdefault(t.section_id, []).append(t)

    bundles: List[PossessionBundle] = []

    for sec_id, sec_tasks in by_section.items():
        if len(sec_tasks) <= 1:
            continue

        # Sort by priority/criticality descending
        sorted_tasks = sorted(
            sec_tasks,
            key=lambda t: (
                1 if t.criticality == TaskPriority.CRITICAL else 0,
                1 if t.priority == TaskPriority.HIGH else 0,
            ),
            reverse=True,
        )

        used_task_ids: Set[str] = set()

        for i, lead_task in enumerate(sorted_tasks):
            if lead_task.task_id in used_task_ids:
                continue

            bundle = PossessionBundle(section_id=sec_id, primary_task=lead_task)
            for other_task in sorted_tasks[i + 1:]:
                if other_task.task_id in used_task_ids:
                    continue
                if bundle.can_bundle(other_task):
                    bundle.add_task(other_task)
                    used_task_ids.add(other_task.task_id)

            if len(bundle.bundled_tasks) > 1:
                used_task_ids.add(lead_task.task_id)
                bundles.append(bundle)

    return bundles
