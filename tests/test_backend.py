"""
CARB-Planner — Automated Backend Tests

Tests cover:
  1. Overlapping maintenance block collision avoidance
  2. Section capacity bounds
  3. Critical task cannot be deferred
  4. Train/block conflict detection
  5. Duration P90 propagation
  6. Disruption injection (Scenario A)
  7. Block cancellation (Scenario B)
  8. Department conflict (Scenario C)
  9. LNS repair produces valid feasible schedules
  10. Explanation engine correctness
  11. Infeasible scenario detection
  12. Greedy baseline comparison
"""

import copy
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from backend.data.generator import generate_demo_scenario
from backend.explanations.generator import generate_explanations
from backend.ml.duration_model import DurationPredictor
from backend.ml.risk_model import RiskPredictor, risk_tier
from backend.models.network import RailwayNetwork
from backend.models.plan import (
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
    TaskType,
)
from backend.models.train import Train
from backend.optimizer.cp_sat import solve_block_plan
from backend.optimizer.greedy_baseline import solve_greedy
from backend.optimizer.lns_repair import apply_disruption
from backend.simulation.railway_sim import compute_detailed_kpis


# ─── Fixtures ───

@pytest.fixture(scope="module")
def demo_scenario():
    """Generate the standard demo scenario once for all tests."""
    scenario = generate_demo_scenario(seed=42)
    network = scenario["network"]
    trains = scenario["trains"]
    tasks = scenario["tasks"]

    # Train ML models
    dur_pred = DurationPredictor()
    dur_pred.train(seed=42)
    risk_pred = RiskPredictor()
    risk_pred.train(seed=42)

    tasks = dur_pred.predict_all(tasks)
    tasks = risk_pred.predict_all(tasks)

    return {
        "network": network,
        "trains": trains,
        "tasks": tasks,
        "dur_pred": dur_pred,
        "risk_pred": risk_pred,
    }


@pytest.fixture(scope="module")
def solved_plan(demo_scenario):
    """Generate a solved plan from the demo scenario."""
    plan = solve_block_plan(
        network=demo_scenario["network"],
        tasks=copy.deepcopy(demo_scenario["tasks"]),
        trains=copy.deepcopy(demo_scenario["trains"]),
        horizon_slots=96,
    )
    plan.kpis = compute_detailed_kpis(plan, demo_scenario["network"])
    return plan


# ─── Test 1: Overlapping maintenance blocks ───

def test_no_overlapping_blocks_on_single_track(solved_plan, demo_scenario):
    """No two maintenance blocks overlap on single-track sections."""
    network = demo_scenario["network"]
    single_track_sections = {s.section_id for s in network.sections if s.capacity <= 1}

    section_allocs = {}
    for alloc in solved_plan.allocations:
        if alloc.section_id in single_track_sections:
            section_allocs.setdefault(alloc.section_id, []).append(alloc)

    for sec_id, allocs in section_allocs.items():
        for i, a in enumerate(allocs):
            for b in allocs[i + 1:]:
                # No overlap: a ends before b starts or b ends before a starts
                assert a.end_slot <= b.start_slot or b.end_slot <= a.start_slot, (
                    f"Overlap on single-track {sec_id}: "
                    f"{a.task_id}[{a.start_slot},{a.end_slot}] vs {b.task_id}[{b.start_slot},{b.end_slot}]"
                )


# ─── Test 2: Section capacity ───

def test_section_capacity_not_exceeded(solved_plan, demo_scenario):
    """At no time slot does the number of concurrent blocks exceed section capacity."""
    network = demo_scenario["network"]
    section_cap = {s.section_id: s.capacity for s in network.sections}

    for slot in range(solved_plan.horizon_slots):
        section_count = {}
        for alloc in solved_plan.allocations:
            if alloc.start_slot <= slot < alloc.end_slot:
                section_count[alloc.section_id] = section_count.get(alloc.section_id, 0) + 1

        for sec_id, count in section_count.items():
            cap = section_cap.get(sec_id, 1)
            assert count <= cap, (
                f"Section {sec_id} at slot {slot}: {count} blocks > capacity {cap}"
            )


# ─── Test 3: Critical task cannot be deferred ───

def test_critical_tasks_not_deferred(solved_plan):
    """All non-deferrable tasks must be scheduled."""
    for task in solved_plan.tasks:
        if not task.is_deferrable:
            assert task.status == TaskStatus.SCHEDULED, (
                f"Non-deferrable task {task.task_id} was not scheduled: {task.status}"
            )


# ─── Test 4: Train/block conflict on single track ───

def test_no_train_block_overlap_single_track(solved_plan, demo_scenario):
    """On single-track sections, maintenance blocks must not overlap train paths."""
    network = demo_scenario["network"]
    single_track = {s.section_id for s in network.sections if s.capacity <= 1}

    for alloc in solved_plan.allocations:
        if alloc.section_id not in single_track:
            continue
        for train in solved_plan.trains:
            for seg in train.path_segments:
                if seg.section_id == alloc.section_id:
                    # No overlap
                    overlap = not (alloc.end_slot <= seg.entry_slot or alloc.start_slot >= seg.exit_slot)
                    assert not overlap, (
                        f"Single-track conflict: {alloc.task_id}[{alloc.start_slot},{alloc.end_slot}] "
                        f"overlaps train {train.train_id}[{seg.entry_slot},{seg.exit_slot}] on {alloc.section_id}"
                    )


# ─── Test 5: P90 duration propagation ───

def test_p90_duration_used(solved_plan):
    """Each scheduled task uses at least its P90 duration."""
    for task in solved_plan.tasks:
        if task.status == TaskStatus.SCHEDULED and task.predicted_p90_min:
            expected_slots = max(1, (task.predicted_p90_min + 14) // 15)
            actual_slots = task.allocated_end_slot - task.allocated_start_slot
            assert actual_slots >= expected_slots, (
                f"Task {task.task_id}: allocated {actual_slots} slots but P90 requires {expected_slots}"
            )


# ─── Test 6: Disruption injection — Scenario A ───

def test_critical_defect_injection(demo_scenario, solved_plan):
    """Injecting a critical defect creates a new non-deferrable task and replanning works."""
    new_task = MaintenanceTask(
        task_id="T_EMRG_01",
        department=Department.ENGINEERING,
        task_type=TaskType.TRACK_MAINTENANCE,
        section_id="S03",
        priority=TaskPriority.CRITICAL,
        criticality=TaskPriority.CRITICAL,
        asset_age=20.0,
        condition_score=0.15,
        crew_size=6,
        historical_duration_min=90,
        predicted_p50_min=90,
        predicted_p90_min=120,
        earliest_start_slot=0,
        deadline_slot=32,
        risk_score=0.92,
        risk_level=RiskLevel.CRITICAL,
        is_deferrable=False,
    )

    disruption = DisruptionEvent(
        disruption_id="TEST_DISRUPT_01",
        disruption_type=DisruptionType.CRITICAL_DEFECT,
        affected_section="S03",
        affected_start_slot=0,
        affected_end_slot=32,
        new_task=new_task,
    )

    tasks_with_defect = copy.deepcopy(demo_scenario["tasks"])
    trains_copy = copy.deepcopy(demo_scenario["trains"])

    repaired_plan, info = apply_disruption(
        disruption=disruption,
        current_plan=solved_plan,
        tasks=tasks_with_defect,
        trains=trains_copy,
        network=demo_scenario["network"],
    )

    assert repaired_plan.is_feasible, "Repaired plan should be feasible"
    # The emergency task must be scheduled
    emrg = next((t for t in repaired_plan.tasks if t.task_id == "T_EMRG_01"), None)
    assert emrg is not None, "Emergency task should exist in repaired plan"
    assert emrg.status == TaskStatus.SCHEDULED, "Emergency task must be scheduled"
    assert info["repair_time_sec"] > 0, "Repair time should be measured"


# ─── Test 7: Block cancellation — Scenario B ───

def test_block_cancellation(demo_scenario, solved_plan):
    """Cancelling a planned block and replanning finds an alternative."""
    # Cancel T04's block
    disruption = DisruptionEvent(
        disruption_id="TEST_DISRUPT_02",
        disruption_type=DisruptionType.BLOCK_CANCELLATION,
        affected_section="S04",
        affected_start_slot=24,
        affected_end_slot=36,
        cancelled_task_id="T04",
    )

    tasks_copy = copy.deepcopy(demo_scenario["tasks"])
    trains_copy = copy.deepcopy(demo_scenario["trains"])

    repaired_plan, info = apply_disruption(
        disruption=disruption,
        current_plan=solved_plan,
        tasks=tasks_copy,
        trains=trains_copy,
        network=demo_scenario["network"],
    )

    assert repaired_plan.is_feasible, "Repaired plan after block cancellation should be feasible"


# ─── Test 8: Department conflict — Scenario C ───

def test_department_conflict_resolution(demo_scenario, solved_plan):
    """Two incompatible departments on the same section are resolved by the optimizer."""
    # Add a conflicting S&T task on S04 where T08 (Electrical) already has work
    conflict_task = MaintenanceTask(
        task_id="T_CONF_01",
        department=Department.SNT,
        task_type=TaskType.SIGNAL_MAINTENANCE,
        section_id="S04",
        priority=TaskPriority.HIGH,
        criticality=TaskPriority.HIGH,
        asset_age=15.0,
        condition_score=0.4,
        crew_size=4,
        historical_duration_min=90,
        predicted_p50_min=90,
        predicted_p90_min=105,
        earliest_start_slot=0,
        deadline_slot=48,
        risk_score=0.65,
        risk_level=RiskLevel.HIGH,
        is_deferrable=True,
    )

    disruption = DisruptionEvent(
        disruption_id="TEST_DISRUPT_03",
        disruption_type=DisruptionType.DEPARTMENT_CONFLICT,
        affected_section="S04",
        affected_start_slot=0,
        affected_end_slot=48,
        new_task=conflict_task,
    )

    tasks_with_conflict = copy.deepcopy(demo_scenario["tasks"])
    trains_copy = copy.deepcopy(demo_scenario["trains"])

    repaired_plan, info = apply_disruption(
        disruption=disruption,
        current_plan=solved_plan,
        tasks=tasks_with_conflict,
        trains=trains_copy,
        network=demo_scenario["network"],
    )

    assert repaired_plan.is_feasible, "Plan with department conflict should be feasible"
    # Check that the two incompatible tasks on S04 don't overlap
    s04_allocs = [a for a in repaired_plan.allocations if a.section_id == "S04"]
    for i, a in enumerate(s04_allocs):
        for b in s04_allocs[i + 1:]:
            a_task = next((t for t in repaired_plan.tasks if t.task_id == a.task_id), None)
            b_task = next((t for t in repaired_plan.tasks if t.task_id == b.task_id), None)
            if a_task and b_task and a_task.department != b_task.department:
                assert a.end_slot <= b.start_slot or b.end_slot <= a.start_slot, (
                    f"Department conflict on S04: {a.task_id} and {b.task_id} overlap"
                )


# ─── Test 9: LNS repair validity ───

def test_lns_repair_freezes_unaffected(demo_scenario, solved_plan):
    """LNS repair should keep unaffected task allocations identical."""
    disruption = DisruptionEvent(
        disruption_id="TEST_DISRUPT_04",
        disruption_type=DisruptionType.CRITICAL_DEFECT,
        affected_section="S06",
        affected_start_slot=32,
        affected_end_slot=64,
        new_task=MaintenanceTask(
            task_id="T_EMRG_02",
            department=Department.ENGINEERING,
            task_type=TaskType.TRACK_INSPECTION,
            section_id="S06",
            priority=TaskPriority.HIGH,
            criticality=TaskPriority.HIGH,
            historical_duration_min=60,
            predicted_p50_min=60,
            predicted_p90_min=75,
            earliest_start_slot=32,
            deadline_slot=64,
            risk_score=0.7,
            risk_level=RiskLevel.HIGH,
            is_deferrable=False,
        ),
    )

    tasks_copy = copy.deepcopy(demo_scenario["tasks"])
    trains_copy = copy.deepcopy(demo_scenario["trains"])

    repaired_plan, info = apply_disruption(
        disruption=disruption,
        current_plan=solved_plan,
        tasks=tasks_copy,
        trains=trains_copy,
        network=demo_scenario["network"],
    )

    assert repaired_plan.is_feasible
    assert info["frozen_tasks"] > 0, "Some tasks should be frozen in LNS"
    assert info["repair_time_sec"] > 0


# ─── Test 10: Explanation engine ───

def test_explanations_generated(solved_plan):
    """Every task should have a valid explanation."""
    explanations = generate_explanations(solved_plan)

    for task in solved_plan.tasks:
        assert task.task_id in explanations, f"No explanation for {task.task_id}"
        exp = explanations[task.task_id]
        assert exp.status == task.status
        assert len(exp.reason_lines) > 0, f"Empty explanation for {task.task_id}"
        assert exp.decision_confidence in ("High", "Medium", "Low")


# ─── Test 11: Infeasible scenario detection ───

def test_infeasible_detection(demo_scenario):
    """An impossible scenario should be detected and reported."""
    # Create two non-deferrable tasks with overlapping windows on same single-track section
    tasks = [
        MaintenanceTask(
            task_id="INFEAS_1",
            department=Department.ENGINEERING,
            task_type=TaskType.TRACK_MAINTENANCE,
            section_id="S03",  # single track
            priority=TaskPriority.CRITICAL,
            criticality=TaskPriority.CRITICAL,
            historical_duration_min=1200,  # 20 hours — impossibly long
            predicted_p90_min=1200,
            earliest_start_slot=0,
            deadline_slot=96,
            is_deferrable=False,
        ),
        MaintenanceTask(
            task_id="INFEAS_2",
            department=Department.SNT,
            task_type=TaskType.SIGNAL_MAINTENANCE,
            section_id="S03",  # same single-track section
            priority=TaskPriority.CRITICAL,
            criticality=TaskPriority.CRITICAL,
            historical_duration_min=1200,
            predicted_p90_min=1200,
            earliest_start_slot=0,
            deadline_slot=96,
            is_deferrable=False,
        ),
    ]

    plan = solve_block_plan(
        network=demo_scenario["network"],
        tasks=tasks,
        trains=[],
        horizon_slots=96,
    )

    assert not plan.is_feasible, "Plan with impossible constraints should be infeasible"
    assert plan.infeasibility_reason is not None


# ─── Test 12: Greedy baseline comparison ───

def test_greedy_baseline_runs(demo_scenario):
    """Greedy baseline should produce a valid plan."""
    plan = solve_greedy(
        network=demo_scenario["network"],
        tasks=copy.deepcopy(demo_scenario["tasks"]),
        trains=copy.deepcopy(demo_scenario["trains"]),
    )

    assert plan.is_feasible
    assert len(plan.allocations) > 0
    assert plan.kpis.maintenance_completed > 0


# ─── Test 13: ML models produce valid outputs ───

def test_duration_prediction(demo_scenario):
    """Duration predictor should return valid P50 <= P90 values."""
    pred = demo_scenario["dur_pred"]
    for task in demo_scenario["tasks"]:
        p50, p90 = pred.predict(task)
        assert p50 > 0, f"P50 must be positive for {task.task_id}"
        assert p90 >= p50, f"P90 must be >= P50 for {task.task_id}"
        assert p50 % 15 == 0, f"P50 must be rounded to 15 min for {task.task_id}"
        assert p90 % 15 == 0, f"P90 must be rounded to 15 min for {task.task_id}"


def test_risk_prediction(demo_scenario):
    """Risk predictor should return valid probability and tier."""
    pred = demo_scenario["risk_pred"]
    for task in demo_scenario["tasks"]:
        prob, level = pred.predict(task)
        assert 0.0 <= prob <= 1.0, f"Risk prob out of range for {task.task_id}"
        assert level in (RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL)
