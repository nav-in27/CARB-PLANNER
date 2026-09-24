import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_api_horizon_overview():
    res = client.get("/api/horizons/overview")
    assert res.status_code == 200
    data = res.json()
    assert "monthly_summary" in data
    assert "weekly_summary" in data
    assert "daily_summary" in data
    assert "versions" in data


def test_api_monthly_plan():
    res = client.get("/api/horizons/monthly")
    assert res.status_code == 200
    data = res.json()
    assert "monthly_plan_id" in data
    assert "weekly_capacities" in data
    assert "department_workloads" in data
    assert "tasks" in data


def test_api_weekly_plan():
    res = client.get("/api/horizons/weekly?week_num=3")
    assert res.status_code == 200
    data = res.json()
    assert "weekly_plan_id" in data
    assert "daily_task_counts" in data
    assert "train_impact_summary" in data


def test_api_traceability():
    res = client.get("/api/horizons/traceability/ENG-014")
    assert res.status_code == 200
    data = res.json()
    assert data["task_id"] == "ENG-014"
    assert "monthly" in data
    assert "weekly" in data
    assert "daily" in data
    assert "operational" in data


def test_api_downstream_impact():
    res = client.post("/api/horizons/monthly/impact", json={"task_id": "ENG-014", "new_week": 4})
    assert res.status_code == 200
    data = res.json()
    assert "replanning_required" in data
    assert data["replanning_required"] is True


def test_disruption_upstream_impact():
    res = client.post("/api/disruptions/apply", json={
        "disruption_type": "Track Blocked",
        "section_id": "S01",
        "description": "Emergency track defect on MS-CGL",
        "task_id": "ENG-014",
        "duration_minutes": 240,
    })
    assert res.status_code == 200
    data = res.json()
    assert "upstream_impact" in data
    upstream = data["upstream_impact"]
    assert "weekly_impact_status" in upstream
