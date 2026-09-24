import pytest
from backend.models.horizon_plans import (
    Resource,
    DepartmentWorkload,
    WeeklyCapacity,
    MonthlyPlan,
    WeeklyPlan,
    MultiHorizonOverview,
    DownstreamImpactReport,
    UpstreamImpactReport,
    derive_horizon_calendar,
)
from backend.models.task import Department, MaintenanceTask, TaskPriority, TaskType


def test_derive_horizon_calendar():
    cal = derive_horizon_calendar("2026-09-18")
    assert cal["month_str"] == "September 2026"
    assert cal["month_key"] == "2026-09"
    assert cal["current_week_num"] == 3
    assert cal["current_day_name"] == "Friday"
    assert len(cal["weeks"]) >= 4
    # Check week 3 range
    week3 = next(w for w in cal["weeks"] if w["week_num"] == 3)
    assert "14" in week3["date_range"] or "15" in week3["date_range"]


def test_multi_horizon_task_fields():
    task = MaintenanceTask(
        task_id="ENG-014",
        department=Department.ENGINEERING,
        task_type=TaskType.TRACK_MAINTENANCE,
        section_id="S01",
        priority=TaskPriority.HIGH,
        criticality=TaskPriority.CRITICAL,
        preferred_week=3,
        planned_day="Wednesday",
        planned_window="08:00–12:00",
        monthly_plan_id="M-2026-09-v1",
        weekly_plan_id="W-2026-09-W3-v1",
        daily_plan_id="D-2026-09-18-v1",
        expected_train_impact=3,
        required_resources=["ENG_CREW_01", "CSM_09_TAMP"],
        why_this_week=["High criticality track section", "Compatible bundling window"],
        why_this_day=["Low train density on Wednesday morning", "Crew available"],
    )
    assert task.preferred_week == 3
    assert task.planned_day == "Wednesday"
    assert task.expected_train_impact == 3
    assert len(task.required_resources) == 2
    assert len(task.why_this_week) == 2
    assert len(task.why_this_day) == 2
