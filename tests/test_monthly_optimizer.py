import pytest
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.optimizer.monthly_optimizer import optimize_monthly_plan, run_monthly_lns
from backend.models.horizon_plans import MonthlyPlan


def test_optimize_monthly_plan():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    
    monthly_plan = optimize_monthly_plan(
        tasks=tasks,
        network=network,
        month_str="September 2026",
        weekly_capacity_hours=56.0,
    )
    
    assert isinstance(monthly_plan, MonthlyPlan)
    assert monthly_plan.monthly_plan_id.startswith("M-2026-09-")
    assert len(monthly_plan.weekly_capacities) >= 4
    assert monthly_plan.kpis["maintenance_completion_pct"] > 80.0
    
    # Joint possession bundling check (e.g. ENG-014 and TRD-009 on S01)
    assert len(monthly_plan.joint_possessions) >= 1
    jp = monthly_plan.joint_possessions[0]
    assert "time_saved_min" in jp
    assert jp["time_saved_min"] > 0
    
    # Check weekly capacities
    for cap in monthly_plan.weekly_capacities:
        assert cap.available_possession_hours == 56.0
        assert cap.requested_possession_hours >= 0
        assert cap.utilization_pct >= 0
    
    # Check department workloads
    assert len(monthly_plan.department_workloads) == 3
    depts = {dw.department.value for dw in monthly_plan.department_workloads}
    assert "Engineering" in depts
    assert "Electrical" in depts
    assert "S&T" in depts
    
    # Check "why_this_week" explanation for ENG-014
    eng14 = next(t for t in monthly_plan.tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014")
    assert eng14.why_this_week is not None
    assert len(eng14.why_this_week) > 0


def test_monthly_lns():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    initial_plan = optimize_monthly_plan(tasks, network, "September 2026", 56.0)
    
    lns_result = run_monthly_lns(initial_plan, max_iterations=5)
    assert lns_result.status in ["COMPLETED", "NO_IMPROVEMENT"]
    assert lns_result.best_plan is not None
    assert isinstance(lns_result.best_plan, MonthlyPlan)
