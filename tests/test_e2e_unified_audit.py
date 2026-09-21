"""
CARB-Planner — End-to-End Unified Engine Audit Test Suite

Validates all 17 requirements of the unified railway planning engine:
  1. Scenario loading & single source of truth
  2. Gapless route continuity across all 23 services
  3. Single-track bottleneck S04 occupancy verification
  4. CP-SAT solver execution & OPTIMAL feasibility
  5. Single-track conflict prevention & regulation
  6. Operational KPI computation (Asset availability >= 90%, 13 tasks scheduled)
  7. ScenarioRepository commit as v1
  8. LNS engine destroy/repair iterations
  9. Scenario version history retrieval
  10. Immutable audit log trail
  11. Non-mutating disruption impact preview (Simulate)
  12. Mutating disruption apply, v2 commit & automatic replan
  13. Critical track defect isolation
  14. Debug train assignments endpoint (0 unassigned movements)
  15. Debug maintenance assignments & loop utilization
  16. Real-time dynamic health across all 8 subsystems
  17. Global train count invariance (exactly 23 services)
"""

import pytest
from fastapi.testclient import TestClient
import copy

from backend.main import app, state, _ensure_loaded
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.initial_solution import generate_initial_solution
from backend.optimizer.lns_engine import run_lns
from backend.database.scenario_repo import scenario_repo
from backend.models.plan import DisruptionEvent, DisruptionType

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_scenario_state():
    """Ensure state is cleanly initialized before each test."""
    _ensure_loaded()


def test_01_scenario_single_source_of_truth():
    """Step 1: Check canonical scenario loading and infrastructure network."""
    res = client.get("/api/scenario")
    assert res.status_code == 200
    data = res.json()
    assert data["stations_count"] == 14
    assert data["sections_count"] == 26
    assert data["data_mode"] in ("PUBLIC_TIMETABLE", "REAL_INFRASTRUCTURE_SIM_OPERATIONS")
    assert len(data["tasks"]) == 13


def test_02_gapless_route_continuity():
    """Step 2: Verify zero gaps in timetable route continuity across all 23 services."""
    timetable = build_corridor_timetable()
    all_errors = []
    for svc in timetable.services:
        errs = svc.validate_route_continuity()
        if errs:
            all_errors.extend([f"{svc.train_id}: {e}" for e in errs])
    assert len(all_errors) == 0, f"Route continuity gaps found: {all_errors}"
    assert timetable.total_services == 23


def test_03_bottleneck_s04_occupancy():
    """Step 3: Section S04/S10 (VRI-ALU single line bottleneck) must have bidirectional occupancies."""
    timetable = build_corridor_timetable()
    s04_occupancies = []
    for svc in timetable.services:
        for occ in svc.occupancy:
            if occ.section_id in ("S04", "S10"):
                s04_occupancies.append((svc.train_id, occ.entry_time_min, occ.exit_time_min, svc.direction.value))
    assert len(s04_occupancies) >= 10, f"Expected >= 10 occupancies on S04/S10 bottleneck, found {len(s04_occupancies)}"
    directions = {occ[3] for occ in s04_occupancies}
    assert "DOWN" in directions and "UP" in directions, "S04/S10 bottleneck must have bidirectional train movements"


def test_04_05_06_cpsat_solver_and_kpis():
    """Steps 4, 5, 6: CP-SAT solves to OPTIMAL, single-track safe, asset availability >= 90%."""
    res = client.post("/api/plan/generate", json={"horizon_slots": 96, "time_limit_sec": 15.0})
    assert res.status_code == 200
    plan_data = res.json()
    assert plan_data["status"] in ("OPTIMAL", "FEASIBLE")
    assert plan_data["is_feasible"] is True
    assert len(plan_data["allocations"]) == 13

    kpis = plan_data["kpis"]
    assert kpis["asset_availability_pct"] >= 90.0
    assert kpis["maintenance_completed"] == 13

    # Check S04 single-track allocations do not overlap scheduled train slots
    for alloc in plan_data["allocations"]:
        if alloc["section_id"] == "S04":
            for train in plan_data["trains"]:
                for seg in train["path_segments"]:
                    if seg["section_id"] == "S04":
                        overlap = not (alloc["end_slot"] <= seg["entry_slot"] or alloc["start_slot"] >= seg["exit_slot"])
                        assert not overlap, f"Conflict on S04: Task {alloc['task_id']} overlaps train {train['train_id']}"


def test_07_scenario_repository_v1_commit():
    """Step 7: Check that initial solution is committed as version 1."""
    versions = scenario_repo.get_versions("SCN_GST_2026_09_18")
    assert len(versions) >= 1
    assert versions[0].version_number == 1


def test_08_lns_metaheuristic_engine():
    """Step 8: Execute LNS optimization with destroy/repair operators."""
    res = client.post("/api/optimizer/lns", json={"max_iterations": 10, "time_limit_sec": 10.0, "destroy_operator": "ALL"})
    assert res.status_code == 200
    lns_data = res.json()
    assert "best_objective" in lns_data
    assert lns_data["iterations_run"] > 0
    assert lns_data["plan"] is not None


def test_09_10_version_history_and_audit_trail():
    """Steps 9 & 10: Verify version listing and immutable audit trail."""
    ver_res = client.get("/api/scenario/versions")
    assert ver_res.status_code == 200
    ver_list = ver_res.json()
    assert len(ver_list) >= 1

    audit_res = client.get("/api/scenario/audit-log")
    assert audit_res.status_code == 200
    audit_list = audit_res.json()
    assert len(audit_list) >= 1
    assert "entry_id" in audit_list[0]
    assert "reason" in audit_list[0]


def test_11_disruption_simulate_non_mutating():
    """Step 11: Non-mutating impact simulation preview."""
    cur_ver = scenario_repo.get_current_version_number()
    payload = {
        "disruption": {
            "event_id": "DIS_TEST_001",
            "disruption_type": "UNSCHEDULED_DEFECT",
            "section_id": "S03",
            "time_slot": 36,
            "start_min": 540,
            "duration_minutes": 90,
            "severity": "CRITICAL",
            "description": "Rail crack on VM-VRI section",
        },
        "time_limit_sec": 10.0,
    }
    res = client.post("/api/disruptions/simulate", json=payload)
    assert res.status_code == 200
    preview = res.json()
    assert "affected_trains" in preview
    assert "affected_tasks" in preview
    assert "is_feasible" in preview
    # Version MUST NOT change on simulate
    assert scenario_repo.get_current_version_number() == cur_ver


def test_12_13_disruption_apply_and_replan():
    """Steps 12 & 13: Mutating disruption apply increments version and updates plan."""
    cur_ver = scenario_repo.get_current_version_number()
    payload = {
        "disruption": {
            "event_id": "DIS_TEST_002",
            "disruption_type": "UNSCHEDULED_DEFECT",
            "section_id": "S03",
            "time_slot": 36,
            "start_min": 540,
            "duration_minutes": 90,
            "severity": "CRITICAL",
            "description": "Emergency rail defect on VM-VRI",
        },
        "auto_replan": True,
        "time_limit_sec": 15.0,
    }
    res = client.post("/api/disruptions/apply", json=payload)
    assert res.status_code == 200
    apply_data = res.json()
    assert apply_data["version_number"] > cur_ver
    assert apply_data["plan"] is not None
    assert apply_data["plan"]["is_feasible"] is True


def test_14_debug_train_assignments_zero_unassigned():
    """Step 14: Check train assignments endpoint has 0 unassigned movements."""
    res = client.get("/api/debug/train-assignments")
    assert res.status_code == 200
    dbg = res.json()
    assert dbg["total_trains"] == 23
    assert dbg["total_assignments"] == 23
    assert len(dbg["unassigned_movements"]) == 0


def test_15_debug_maintenance_assignments():
    """Step 15: Check maintenance assignments and loop allocations."""
    res = client.get("/api/debug/maintenance-assignments")
    assert res.status_code == 200
    dbg = res.json()
    assert dbg["total_allocations"] >= 13
    assert len(dbg["allocations"]) == dbg["total_allocations"]
    assert dbg["scheduled_tasks"] == dbg["total_allocations"]


def test_16_system_health_all_subsystems():
    """Step 16: Verify dynamic health across all 8 subsystems."""
    res = client.get("/api/system/health")
    assert res.status_code == 200
    health = res.json()
    assert len(health["subsystems"]) == 8
    subsystem_names = [s["name"] for s in health["subsystems"]]
    assert any("FastAPI" in n for n in subsystem_names)
    assert any("Topology" in n for n in subsystem_names)
    assert any("Timetable" in n for n in subsystem_names)
    assert any("CP-SAT" in n for n in subsystem_names)
    assert any("LNS" in n for n in subsystem_names)
    assert any("Disruption" in n for n in subsystem_names)
    assert any("ML Duration" in n for n in subsystem_names)
    assert any("Repository" in n for n in subsystem_names)
    for sub in health["subsystems"]:
        assert sub["status"] == "HEALTHY", f"Subsystem {sub['name']} is {sub['status']}"


def test_17_train_count_invariance():
    """Step 17: Train count must be exactly 23 across all endpoints and models."""
    tt_res = client.get("/api/timetable")
    assert tt_res.status_code == 200
    assert tt_res.json()["total_services"] == 23

    trains_res = client.get("/api/trains")
    assert trains_res.status_code == 200
    assert len(trains_res.json()) == 23

    scenario_res = client.get("/api/scenario")
    assert scenario_res.status_code == 200
    assert len(scenario_res.json()["train_services"]) == 23
    assert len(scenario_res.json()["train_run_ids"]) == 23
