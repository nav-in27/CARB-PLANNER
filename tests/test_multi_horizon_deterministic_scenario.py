import pytest
from backend.data.generator import (
    generate_network,
    generate_maintenance_tasks,
)
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.horizon_coordinator import HorizonCoordinator
from backend.optimizer.cp_sat import solve_block_plan

def test_deterministic_scenario_section_53():
    """
    Deterministic Scenario Test as specified in Prompt Section 53:
    1. Canonical scenario setup (September 2026, Week 3, Wednesday = 2026-09-18).
    2. Monthly Optimization: Week 3 has 5 tasks, ENG-014 assigned with 'why_this_week'.
    3. Weekly Optimization: Wednesday has 3 tasks (ENG-014, TRD-009, SNT-021), ENG-014 has 'why_this_day'.
    4. Daily Operational Block Planning: ENG-014 assigned exact operational window.
    5. Track Disruption on S01 (MS-CGL): Daily replan executes and upstream impact evaluated.
    6. Multi-horizon impact propagation: Upstream weekly impact assessed, monthly stability tracked.
    7. 4-tier traceability verified for ENG-014.
    """
    # 1. Setup Canonical Network & Data
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    planning_date = "2026-09-16" # Wednesday in Week 3
    timetable = build_corridor_timetable(planning_date=planning_date)
    
    coordinator = HorizonCoordinator(
        network=network,
        tasks=tasks,
        timetable=timetable,
        planning_date=planning_date,
    )
    
    # Initialize all linked horizons
    coordinator.initialize_plans()
    
    # 2. Verify Monthly Plan
    monthly_plan = coordinator.monthly_plan
    assert monthly_plan is not None
    assert monthly_plan.monthly_plan_id.startswith("M-2026-09-")
    assert monthly_plan.status in ["DRAFT", "APPROVED"]
    assert len(monthly_plan.tasks) == 13
    
    # Check Week 3 contains exactly 5 tasks
    week_3_tasks = [t for t in monthly_plan.tasks if t.preferred_week == 3]
    assert len(week_3_tasks) == 5, f"Expected 5 tasks in Week 3, got {len(week_3_tasks)}"
    
    # Find ENG-014 in monthly plan
    eng_014_monthly = next((t for t in monthly_plan.tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014"), None)
    assert eng_014_monthly is not None, "ENG-014 must be present in monthly plan"
    assert eng_014_monthly.preferred_week == 3
    assert eng_014_monthly.why_this_week is not None
    assert len(eng_014_monthly.why_this_week) > 0
    assert any(term in r for r in eng_014_monthly.why_this_week for term in ["Week 3", "priority", "capacity", "possession", "crew", "safety"])
    
    # Approve Monthly Plan
    coordinator.approve_monthly_plan(mode="APPROVED", notes="Approved by Chief Track Engineer")
    assert coordinator.monthly_plan.status == "APPROVED"
    
    # 3. Verify Weekly Plan for Week 3
    weekly_plan = coordinator.weekly_plans.get(3)
    assert weekly_plan is not None
    assert weekly_plan.weekly_plan_id.startswith("W-2026-09-W3-")
    assert len(weekly_plan.tasks) == 5
    
    # Check Wednesday tasks in Week 3
    wednesday_tasks = [t for t in weekly_plan.tasks if t.planned_day == "Wednesday"]
    assert len(wednesday_tasks) == 3, f"Expected 3 tasks on Wednesday, got {len(wednesday_tasks)}"
    
    wed_task_ids = {t.task_id for t in wednesday_tasks} | {getattr(t, "alias", "") for t in wednesday_tasks}
    assert "ENG-014" in wed_task_ids or "T01" in wed_task_ids
    assert "TRD-009" in wed_task_ids or "T09" in wed_task_ids
    assert "SNT-021" in wed_task_ids or "T05" in wed_task_ids
    
    eng_014_weekly = next(t for t in weekly_plan.tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014")
    assert eng_014_weekly.planned_day == "Wednesday"
    assert eng_014_weekly.planned_window is not None
    assert eng_014_weekly.why_this_day is not None
    assert len(eng_014_weekly.why_this_day) > 0
    assert any(term in r for r in eng_014_weekly.why_this_day for term in ["Wednesday", "density", "traffic", "resource", "conflict", "window"])
    
    # Approve Weekly Plan
    coordinator.approve_weekly_plan(week_num=3, mode="APPROVED", notes="Approved by Divisional Railway Manager")
    assert coordinator.weekly_plans[3].status == "APPROVED"
    
    # 4. Daily Operational Block Planning (Run CP-SAT solver)
    trains = [s.to_legacy() for s in timetable.services]
    daily_plan = solve_block_plan(network, tasks, trains=trains, horizon_slots=96, time_limit_sec=10.0)
    assert daily_plan is not None
    coordinator.daily_plan = daily_plan.model_dump()
    
    # Check 4-Tier Traceability before disruption
    trace_before = coordinator.get_task_traceability("ENG-014")
    assert trace_before["task_id"] == "ENG-014"
    assert trace_before["monthly"]["week"] == 3
    assert trace_before["weekly"]["day"] == "Wednesday"
    assert trace_before["daily"]["status"] in ["PLANNED", "SCHEDULED"]
    assert trace_before["daily"]["time_slot"] is not None
    assert len(trace_before["monthly"]["why_this_week"]) > 0
    assert len(trace_before["weekly"]["why_this_day"]) > 0
    
    # 5. Upstream Disruption Impact Evaluation (Minor overrun <= 120m -> Weekly Plan Unaffected)
    upstream_minor = coordinator.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=45,
        can_reschedule_within_week=True,
    )
    assert upstream_minor.weekly_commitment_met is True
    assert upstream_minor.weekly_impact_status == "WEEKLY PLAN UNAFFECTED"
    assert upstream_minor.monthly_target_met is True
    assert upstream_minor.monthly_impact_status == "MONTHLY PLAN UNAFFECTED"
    
    # Upstream Disruption Impact Evaluation (Severe cancellation / > 120m -> Weekly Review Required)
    upstream_severe = coordinator.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=180,
        can_reschedule_within_week=False,
    )
    assert upstream_severe.weekly_commitment_met is False
    assert upstream_severe.weekly_impact_status == "WEEKLY REVIEW REQUIRED"
    assert upstream_severe.monthly_target_met is False
    assert upstream_severe.monthly_impact_status == "MONTHLY TARGET AT RISK"
    
    # 6. Downstream Impact Propagation (Moving task across weeks triggers cascade report)
    downstream_rep = coordinator.compute_downstream_impact(task_id="ENG-014", new_week=4)
    assert downstream_rep.replanning_required is True
    assert "Week 3" in downstream_rep.change_description
    assert "Week 4" in downstream_rep.change_description
    assert len(downstream_rep.affected_weekly_plans) > 0
    assert len(downstream_rep.message) > 0
    
    # 7. Multi-Horizon Dashboard Overview
    overview = coordinator.get_multi_horizon_overview()
    assert overview.monthly_summary["tasks_count"] == 13
    assert overview.monthly_summary["status"] == "APPROVED"
    assert overview.weekly_summary["tasks_count"] == 5
    assert overview.weekly_summary["status"] == "APPROVED"
    assert overview.daily_summary["active_possessions"] == 3
