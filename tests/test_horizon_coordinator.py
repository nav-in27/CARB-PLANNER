import pytest
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.horizon_coordinator import HorizonCoordinator


def test_horizon_coordination_and_traceability():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Traceability check for ENG-014
    trace = coord.get_task_traceability("ENG-014")
    assert trace["task_id"] == "ENG-014"
    assert trace["monthly"]["week"] == 3
    assert trace["weekly"]["day"] == "Wednesday"
    assert trace["daily"]["window"] is not None
    assert trace["operational"]["status"] is not None
    assert "loop_usage" in trace["operational"]


def test_downstream_impact_analysis():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Moving ENG-014 from Week 3 to Week 4
    impact = coord.compute_downstream_impact(task_id="ENG-014", new_week=4)
    assert impact.replanning_required is True
    assert len(impact.affected_weekly_plans) >= 1
    assert "replan" in impact.message.lower()

    # If no change is made
    no_impact = coord.compute_downstream_impact(task_id="ENG-014", new_week=3)
    assert no_impact.replanning_required is False
    assert "NO DOWNSTREAM IMPACT" in no_impact.message


def test_upstream_impact_assessment():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Minor disruption (30 min overrun, still completed within week)
    minor_report = coord.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=30,
        can_reschedule_within_week=True,
    )
    assert minor_report.weekly_impact_status == "WEEKLY PLAN UNAFFECTED"
    
    # Major cancellation or multi-day block
    major_report = coord.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=300,
        can_reschedule_within_week=False,
    )
    assert major_report.weekly_impact_status == "WEEKLY REVIEW REQUIRED"


def test_approval_workflow_and_versioning():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable("2026-09-18")
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Plan versioning format check
    assert coord.monthly_plan.monthly_plan_id.startswith("M-2026-09-v")
    assert coord.current_weekly_plan.weekly_plan_id.startswith("W-2026-09-W3-v")
    
    # Approval workflows
    coord.approve_monthly_plan(mode="REVIEW", notes="Checking track machine availability")
    assert coord.monthly_plan.status == "REVIEW"
    coord.approve_monthly_plan(mode="APPROVED", notes="Signed off by Sr. DOM")
    assert coord.monthly_plan.status == "APPROVED"
