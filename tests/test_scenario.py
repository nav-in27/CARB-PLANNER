"""
CARB-Planner — Scenario & Single Source of Truth API Tests
Verifies that /api/scenario, /api/corridor, /api/maintenance return
consistent, enriched data grounded in the Southern Railway Tamil Nadu corridor.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_get_corridor():
    """Verify single canonical corridor endpoint."""
    res = client.get("/api/corridor")
    assert res.status_code == 200
    data = res.json()
    assert data["corridor_id"] == "SR_GST_01"
    assert "Grand South Trunk" in data["name"]
    assert "Chennai Egmore" in data["origin"]
    assert "Kanniyakumari" in data["destination"]
    assert data["total_distance_km"] == 742.0
    assert len(data["divisions"]) >= 4
    assert len(data["alternate_routes"]) >= 3


def test_get_scenario():
    """Verify single source of truth scenario endpoint."""
    res = client.get("/api/scenario")
    assert res.status_code == 200
    data = res.json()
    assert "scenario_id" in data
    assert data["corridor"]["corridor_id"] == "SR_GST_01"
    assert data["planning_date"] == "2026-09-18"
    assert data["timetable_version"] == "SR-WTT-2026-V1"
    assert len(data["train_services"]) == 23
    assert len(data["tasks"]) >= 10
    assert data["stations_count"] == 14
    assert data["sections_count"] == 26


def test_update_scenario():
    """Verify scenario update endpoint modifies global context."""
    res = client.post(
        "/api/scenario/update",
        json={"planning_date": "2026-09-19", "direction": "DOWN"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["planning_date"] == "2026-09-19"
    assert data["selected_direction"] == "DOWN"
    
    # Restore standard date
    client.post(
        "/api/scenario/update",
        json={"planning_date": "2026-09-18", "direction": "BOTH"},
    )


def test_get_maintenance():
    """Verify enriched maintenance tasks endpoint."""
    res = client.get("/api/maintenance")
    assert res.status_code == 200
    tasks = res.json()
    assert len(tasks) >= 10
    for t in tasks:
        assert "task_id" in t
        assert "department" in t
        assert "section_name" in t
        assert "p50_duration_min" in t
        assert "p90_duration_min" in t
        assert "affected_tracks" in t
        assert "explanation" in t
        assert "decision" in t["explanation"]


def test_update_maintenance_task():
    """Verify updating a maintenance task status and timing."""
    # Fetch first task
    tasks_res = client.get("/api/maintenance")
    task_id = tasks_res.json()[0]["task_id"]
    
    put_res = client.put(f"/api/maintenance/{task_id}", json={"status": "Completed"})
    assert put_res.status_code == 200
    updated_task = put_res.json()
    assert updated_task["status"] == "Completed"
