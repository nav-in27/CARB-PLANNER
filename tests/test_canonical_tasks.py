import pytest
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.models.task import Department


def test_canonical_tasks_multi_horizon():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    
    # Must include canonical IDs
    task_ids = {t.task_id for t in tasks}
    assert "ENG-014" in task_ids or any(getattr(t, "alias", "") == "ENG-014" for t in tasks)
    assert any(t.task_id == "T08" or getattr(t, "alias", "") == "T08" for t in tasks)
    assert any(t.task_id == "T02" or getattr(t, "alias", "") == "T02" for t in tasks)
    assert any(t.task_id == "T04" or getattr(t, "alias", "") == "T04" for t in tasks)
    
    # Week 3 tasks check (must have at least 5 tasks per test scenario)
    week_3_tasks = [t for t in tasks if t.preferred_week == 3]
    assert len(week_3_tasks) >= 5
    
    # Wednesday tasks check (must have at least 3 tasks per test scenario)
    wed_tasks = [t for t in week_3_tasks if t.planned_day == "Wednesday"]
    assert len(wed_tasks) >= 3
    
    # Check that ENG-014 is in Week 3, Wednesday, on section S01
    eng14 = next(t for t in tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014")
    assert eng14.preferred_week == 3
    assert eng14.planned_day == "Wednesday"
    assert eng14.department == Department.ENGINEERING
    assert eng14.section_id == "S01"
