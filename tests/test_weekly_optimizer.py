import pytest
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.monthly_optimizer import optimize_monthly_plan
from backend.optimizer.weekly_optimizer import optimize_weekly_plan, run_weekly_lns
from backend.models.horizon_plans import WeeklyPlan


def test_optimize_weekly_plan():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    monthly_plan = optimize_monthly_plan(tasks, network, "September 2026", 56.0)
    
    weekly_plan = optimize_weekly_plan(
        monthly_plan=monthly_plan,
        week_num=3,
        network=network,
        timetable=timetable,
        date_range_str="14–20 September 2026",
    )
    
    assert isinstance(weekly_plan, WeeklyPlan)
    assert weekly_plan.weekly_plan_id.startswith("W-2026-09-W3-")
    assert len(weekly_plan.tasks) >= 5
    assert "Wednesday" in weekly_plan.daily_task_counts
    assert weekly_plan.daily_task_counts["Wednesday"] >= 3
    
    # Train impact evaluation
    assert "affected_services_total" in weekly_plan.train_impact_summary
    
    # ENG-014 must have "why_this_day" explanation
    eng14 = next(t for t in weekly_plan.tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014")
    assert eng14.planned_day == "Wednesday"
    assert eng14.why_this_day is not None
    assert len(eng14.why_this_day) > 0


def test_weekly_lns():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    monthly_plan = optimize_monthly_plan(tasks, network, "September 2026", 56.0)
    weekly_plan = optimize_weekly_plan(monthly_plan, 3, network, timetable, "14–20 September 2026")
    
    result = run_weekly_lns(weekly_plan, timetable, network, max_iterations=5)
    assert result.status in ["COMPLETED", "NO_IMPROVEMENT"]
    assert result.best_plan is not None
    assert isinstance(result.best_plan, WeeklyPlan)

