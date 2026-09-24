# Multi-Time-Horizon Block Planning (Weekly + Monthly) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a fully functional, interconnected multi-horizon maintenance planning system (Monthly Strategy → Weekly Possession → Daily 24-Hour Operational Block → Disruption Replanning) in CARB-Planner using the single canonical railway dataset, optimization engines with horizon-specific LNS, and end-to-end traceability.

**Architecture:** Extend the existing canonical scenario and CP-SAT/LNS solver pipeline with Monthly and Weekly domain models, horizon-specific optimizers, and a horizon coordinator. The Monthly optimizer handles strategic week placement, multi-department bundling (joint possessions), workload balancing, and capacity constraints; the Weekly optimizer converts candidate tasks into day and possession windows with timetable-aware train impact analysis; the Daily planner retains operational authority for 15-minute slot allocations and loop routing. Bi-directional impact propagation ensures that monthly changes report downstream impacts and daily disruptions evaluate upstream maintenance commitments.

**Tech Stack:** Python 3.11, FastAPI, Google OR-Tools CP-SAT, NumPy, Pydantic, Pytest, React, Vite, Lucide React, Vanilla CSS.

---

### Task 1: Canonical Multi-Horizon Domain Models & Date Helpers

**Files:**
- Create: `backend/models/horizon_plans.py`
- Modify: `backend/models/task.py:54-94`
- Test: `tests/test_multi_horizon_models.py`

**Step 1: Write the failing test**

```python
# tests/test_multi_horizon_models.py
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
    )
    assert task.preferred_week == 3
    assert task.planned_day == "Wednesday"
    assert task.expected_train_impact == 3
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_multi_horizon_models.py -v`
Expected: FAIL with ModuleNotFoundError or ImportError

**Step 3: Implement minimal code**

1. In `backend/models/task.py`, add multi-horizon fields:
   - `monthly_plan_id: Optional[str] = None`
   - `preferred_week: Optional[int] = None`
   - `monthly_status: Optional[str] = "PROPOSED"`
   - `weekly_plan_id: Optional[str] = None`
   - `planned_day: Optional[str] = None`
   - `planned_window: Optional[str] = None`
   - `weekly_status: Optional[str] = "CANDIDATE"`
   - `daily_plan_id: Optional[str] = None`
   - `daily_status: Optional[str] = "REQUESTED"`
   - `required_resources: List[str] = Field(default_factory=list)`
   - `required_possession_type: Optional[str] = None`
   - `expected_train_impact: Optional[int] = None`
   - `due_date: Optional[str] = None`
   - `maintenance_deadline: Optional[str] = None`
   - `bundling_partner_id: Optional[str] = None`
   - `is_joint_possession: bool = False`
   - `why_this_week: Optional[List[str]] = None`
   - `why_this_day: Optional[List[str]] = None`
   - `why_this_window: Optional[List[str]] = None`
   - `alias: Optional[str] = None`

2. In `backend/models/horizon_plans.py`:
   - Implement `derive_horizon_calendar(planning_date: str)`
   - Implement `Resource`, `DepartmentWorkload`, `WeeklyCapacity`, `MonthlyPlan`, `WeeklyPlan`, `MultiHorizonOverview`, `DownstreamImpactReport`, `UpstreamImpactReport`.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_multi_horizon_models.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/models/horizon_plans.py backend/models/task.py tests/test_multi_horizon_models.py
git commit -m "feat(models): add multi-horizon planning models and calendar derivation"
```

---

### Task 2: Canonical Task Dataset Enrichment with Deterministic Scenario

**Files:**
- Modify: `backend/data/generator.py:1040-1135`
- Test: `tests/test_canonical_tasks.py`

**Step 1: Write the failing test**

```python
# tests/test_canonical_tasks.py
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.models.task import Department

def test_canonical_tasks_multi_horizon():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    
    # Must include ENG-014, TRD-009, SNT-021, ENG-018, T02, T04, T08
    task_ids = {t.task_id for t in tasks}
    assert "ENG-014" in task_ids or any(getattr(t, "alias", "") == "ENG-014" for t in tasks)
    assert any(t.task_id == "T08" or getattr(t, "alias", "") == "T08" for t in tasks)
    
    # Week 3 tasks check
    week_3_tasks = [t for t in tasks if t.preferred_week == 3]
    assert len(week_3_tasks) >= 5
    
    # Wednesday tasks check
    wed_tasks = [t for t in week_3_tasks if t.planned_day == "Wednesday"]
    assert len(wed_tasks) >= 3
    
    # Check that ENG-014 is in Week 3, Wednesday
    eng14 = next(t for t in tasks if t.task_id == "ENG-014" or getattr(t, "alias", "") == "ENG-014")
    assert eng14.preferred_week == 3
    assert eng14.planned_day == "Wednesday"
    assert eng14.department == Department.ENGINEERING
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_canonical_tasks.py -v`
Expected: FAIL

**Step 3: Update `backend/data/generator.py`**

- Enrich `task_defs` to define canonical tasks across all 4 weeks of the month, covering Engineering, S&T, and Electrical, with:
  - `ENG-014` on S01 (MS-CGL), Preferred Week 3, Wednesday, 08:00–12:00, High/Critical.
  - `TRD-009` on S01 (MS-CGL), Preferred Week 3, Wednesday, OHE Inspection, bundling-compatible.
  - `SNT-021` on S05 (ALU-TPJ), Preferred Week 3, Wednesday.
  - `ENG-018` on S02 (CGL-VM), Preferred Week 3, Thursday.
  - `TRD-042` on S02 (CGL-VM), Preferred Week 3, Thursday.
  - Tasks for Week 1, Week 2, and Week 4.
  - Maintain compatibility aliases for `T01..T13` so existing tests referencing `T02`, `T04`, `T08` pass without interruption.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_canonical_tasks.py tests/test_backend.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/data/generator.py tests/test_canonical_tasks.py
git commit -m "feat(data): enrich canonical maintenance tasks across 4 weeks with test scenario"
```

---

### Task 3: Monthly Optimization Engine & Monthly LNS

**Files:**
- Create: `backend/optimizer/monthly_optimizer.py`
- Test: `tests/test_monthly_optimizer.py`

**Step 1: Write the failing test**

```python
# tests/test_monthly_optimizer.py
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
    
    # Joint possession bundling check
    assert len(monthly_plan.joint_possessions) >= 1
    
    # ENG-014 must have "why_this_week" explanation
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
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_monthly_optimizer.py -v`
Expected: FAIL with ModuleNotFoundError

**Step 3: Implement `backend/optimizer/monthly_optimizer.py`**

- Implement `optimize_monthly_plan()`:
  - Balances tasks into Week 1..Week 4 respecting `preferred_week`, deadlines, asset risk, and weekly capacity.
  - Multi-Department Bundling: groups compatible tasks on same section into `joint_possessions` (Engineering + TRD, Engineering + S&T) with combined duration.
  - Computes `weekly_capacities`: requested possession hours, available possession hours (default 56.0h), utilization %, and overload alerts + actionable recommendations (defer noncritical, bundle, shift week).
  - Computes `department_workloads` (Engineering, TRD, S&T tasks, hours, utilization).
  - Computes asset availability before and after maintenance.
  - Estimates expected train impact based on corridor timetable density.
  - Generates transparent "WHY THIS WEEK?" explanation for every task.
- Implement `run_monthly_lns()`:
  - Operators: `MOVE_TASK_TO_WEEK`, `SWAP_TASKS`, `BUNDLE_TASKS`, `UNBUNDLE_TASKS`, `SHIFT_POSSESSION`, `REASSIGN_RESOURCE`, `DEFER_NONCRITICAL_TASK`.
  - Evaluates objective improvement honestly.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_monthly_optimizer.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/optimizer/monthly_optimizer.py tests/test_monthly_optimizer.py
git commit -m "feat(optimizer): implement monthly maintenance optimizer and monthly LNS"
```

---

### Task 4: Weekly Possession Optimization Engine & Weekly LNS

**Files:**
- Create: `backend/optimizer/weekly_optimizer.py`
- Test: `tests/test_weekly_optimizer.py`

**Step 1: Write the failing test**

```python
# tests/test_weekly_optimizer.py
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.monthly_optimizer import optimize_monthly_plan
from backend.optimizer.weekly_optimizer import optimize_weekly_plan, run_weekly_lns
from backend.models.horizon_plans import WeeklyPlan

def test_optimize_weekly_plan():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable(network)
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
    timetable = build_corridor_timetable(network)
    monthly_plan = optimize_monthly_plan(tasks, network, "September 2026", 56.0)
    weekly_plan = optimize_weekly_plan(monthly_plan, 3, network, timetable, "14–20 September 2026")
    
    result = run_weekly_lns(weekly_plan, timetable, network, max_iterations=5)
    assert result.status in ["COMPLETED", "NO_IMPROVEMENT"]
    assert result.best_plan is not None
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_weekly_optimizer.py -v`
Expected: FAIL with ModuleNotFoundError

**Step 3: Implement `backend/optimizer/weekly_optimizer.py`**

- Implement `optimize_weekly_plan()`:
  - Filters candidate tasks from `monthly_plan` where `preferred_week == week_num`.
  - Assigns each task to a specific day (`MON..SUN`) and possession window (`08:00–12:00`, `22:00–02:00`, etc.).
  - Evaluates train impact against timetable services: affected train services, potential delay, potential holding/rerouting, loop availability.
  - Detects weekly conflicts: same track, section, crew, or machine double-booked.
  - Multi-department joint possession coordination for compatible tasks on the same day and section.
  - Generates transparent "WHY THIS DAY?" explanation for every task.
- Implement `run_weekly_lns()`:
  - Operators: `MOVE_TASK_TO_DAY`, `SHIFT_WINDOW`, `SWAP_POSSESSIONS`, `BUNDLE_POSSESSIONS`, `REASSIGN_CREW`, `USE_ALTERNATE_SECTION`.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_weekly_optimizer.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/optimizer/weekly_optimizer.py tests/test_weekly_optimizer.py
git commit -m "feat(optimizer): implement weekly possession optimizer and weekly LNS"
```

---

### Task 5: Horizon Coordinator, Traceability, & Upstream/Downstream Propagation

**Files:**
- Create: `backend/optimizer/horizon_coordinator.py`
- Test: `tests/test_horizon_coordinator.py`

**Step 1: Write the failing test**

```python
# tests/test_horizon_coordinator.py
from backend.data.generator import generate_network, generate_maintenance_tasks
from backend.data.timetable import build_corridor_timetable
from backend.optimizer.horizon_coordinator import HorizonCoordinator

def test_horizon_coordination_and_traceability():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable(network)
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # 1. Traceability check
    trace = coord.get_task_traceability("ENG-014")
    assert trace["task_id"] == "ENG-014"
    assert trace["monthly"]["week"] == 3
    assert trace["weekly"]["day"] == "Wednesday"
    assert trace["daily"]["window"] is not None
    assert trace["operational"]["status"] is not None

def test_downstream_impact_analysis():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable(network)
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Moving ENG-014 from Week 3 to Week 4
    impact = coord.compute_downstream_impact(task_id="ENG-014", new_week=4)
    assert impact.replanning_required is True
    assert len(impact.affected_weekly_plans) >= 1
    assert "replan" in impact.message.lower()

def test_upstream_impact_assessment():
    network = generate_network()
    tasks = generate_maintenance_tasks(network)
    timetable = build_corridor_timetable(network)
    
    coord = HorizonCoordinator(network, tasks, timetable, planning_date="2026-09-18")
    coord.initialize_plans()
    
    # Simulate a minor disruption (still completed within week)
    minor_report = coord.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=30,
        can_reschedule_within_week=True,
    )
    assert minor_report.weekly_impact_status == "WEEKLY PLAN UNAFFECTED"
    
    # Simulate a major cancellation or multi-day block
    major_report = coord.evaluate_upstream_impact(
        disrupted_task_id="ENG-014",
        overrun_minutes=300,
        can_reschedule_within_week=False,
    )
    assert major_report.weekly_impact_status == "WEEKLY REVIEW REQUIRED"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_horizon_coordinator.py -v`
Expected: FAIL with ModuleNotFoundError

**Step 3: Implement `backend/optimizer/horizon_coordinator.py`**

- Manage the complete lifecycle:
  - `initialize_plans(planning_date)`: runs monthly, weekly, daily optimizers; links `monthly_plan_id`, `weekly_plan_id`, `daily_plan_id`.
  - `get_task_traceability(task_id)`: returns full 4-tier trace.
  - `compute_downstream_impact(task_id, new_week, new_day)`: evaluates downstream effects on weekly/daily allocations.
  - `evaluate_upstream_impact(disrupted_task_id, overrun_minutes, can_reschedule_within_week)`: evaluates whether disruption violates weekly commitment or monthly target.
  - Plan versioning: `M-2026-09-v1`, `W-2026-09-W3-v1`, `D-2026-09-18-v1`.
  - Approval workflows:
    - Monthly: `DRAFT` → `REVIEW` → `APPROVED`
    - Weekly: `CANDIDATE/DRAFT` → `REVIEW` → `APPROVED`
    - Daily: `DRAFT` → `VALIDATED` → `APPROVED` → `ACTIVE`
  - Report generators: Monthly Maintenance Report, Weekly Report, Daily Report.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_horizon_coordinator.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/optimizer/horizon_coordinator.py tests/test_horizon_coordinator.py
git commit -m "feat(coordinator): implement horizon coordinator, traceability, and impact propagation"
```

---

### Task 6: FastAPI Multi-Horizon Endpoints & Disruption Upstream Integration

**Files:**
- Modify: `backend/main.py:100-200, 560-600, 1030-1080, 1360-1550`
- Test: `tests/test_multi_horizon_api.py`

**Step 1: Write the failing test**

```python
# tests/test_multi_horizon_api.py
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

def test_api_monthly_plan():
    res = client.get("/api/horizons/monthly")
    assert res.status_code == 200
    data = res.json()
    assert "monthly_plan_id" in data
    assert "weekly_capacities" in data

def test_api_weekly_plan():
    res = client.get("/api/horizons/weekly?week_num=3")
    assert res.status_code == 200
    data = res.json()
    assert "weekly_plan_id" in data
    assert "daily_task_counts" in data

def test_api_traceability():
    res = client.get("/api/horizons/traceability/ENG-014")
    assert res.status_code == 200
    data = res.json()
    assert data["task_id"] == "ENG-014"
    assert "monthly" in data
    assert "weekly" in data
    assert "daily" in data

def test_api_downstream_impact():
    res = client.post("/api/horizons/monthly/impact", json={"task_id": "ENG-014", "new_week": 4})
    assert res.status_code == 200
    data = res.json()
    assert "replanning_required" in data

def test_disruption_upstream_impact():
    res = client.post("/api/disruptions/apply", json={
        "disruption_type": "Track Blocked",
        "section_id": "S01",
        "description": "Emergency track defect on MS-CGL",
        "task_id": "ENG-014",
        "duration_minutes": 360,
    })
    assert res.status_code == 200
    data = res.json()
    assert "upstream_impact" in data
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_multi_horizon_api.py -v`
Expected: FAIL

**Step 3: Integrate endpoints in `backend/main.py`**

- Instantiate `HorizonCoordinator` in `AppState`.
- Add routes:
  - `GET /api/horizons/overview`
  - `GET /api/horizons/monthly`
  - `POST /api/horizons/monthly/optimize`
  - `POST /api/horizons/monthly/lns`
  - `POST /api/horizons/monthly/approve`
  - `POST /api/horizons/monthly/impact`
  - `GET /api/horizons/weekly`
  - `POST /api/horizons/weekly/optimize`
  - `POST /api/horizons/weekly/lns`
  - `POST /api/horizons/weekly/approve`
  - `POST /api/horizons/weekly/impact`
  - `GET /api/horizons/traceability/{task_id}`
  - `GET /api/horizons/reports/{horizon}`
- Update `apply_disruption` and `simulate_disruption` in `main.py` to evaluate upstream impact (`WEEKLY PLAN UNAFFECTED` or `WEEKLY REVIEW REQUIRED`) and include in response.

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_multi_horizon_api.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/main.py tests/test_multi_horizon_api.py
git commit -m "feat(api): expose multi-horizon endpoints and disruption upstream impact"
```

---

### Task 7: Deterministic End-to-End Test (Section 53)

**Files:**
- Create: `tests/test_multi_horizon_deterministic_scenario.py`

**Step 1: Write test reflecting prompt Section 53**

```python
# tests/test_multi_horizon_deterministic_scenario.py
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_deterministic_multi_horizon_workflow():
    # 1. Ensure scenario is initialized for September 2026
    res = client.post("/api/scenario/update", json={"planning_date": "2026-09-18"})
    assert res.status_code == 200
    
    # 2. Run Monthly Optimizer
    m_opt = client.post("/api/horizons/monthly/optimize")
    assert m_opt.status_code == 200
    monthly_data = m_opt.json()
    
    # Verify ENG-014 assigned to Week 3
    eng14_m = next(t for t in monthly_data["tasks"] if t["task_id"] == "ENG-014" or t.get("alias") == "ENG-014")
    assert eng14_m["preferred_week"] == 3
    
    # 3. Run Weekly Optimizer for Week 3
    w_opt = client.post("/api/horizons/weekly/optimize?week_num=3")
    assert w_opt.status_code == 200
    weekly_data = w_opt.json()
    
    # Verify ENG-014 assigned to Wednesday (window 08:00–12:00)
    eng14_w = next(t for t in weekly_data["tasks"] if t["task_id"] == "ENG-014" or t.get("alias") == "ENG-014")
    assert eng14_w["planned_day"] == "Wednesday"
    assert "08:00" in eng14_w["planned_window"]
    
    # 4. Run Daily Optimizer for planning date (Wednesday / Friday)
    d_opt = client.post("/api/plan/generate", json={"horizon_slots": 96, "time_limit_sec": 15.0})
    assert d_opt.status_code == 200
    daily_data = d_opt.json()
    
    # Verify ENG-014 allocated daily slot (e.g. 08:45–10:30)
    eng14_alloc = next((a for a in daily_data.get("allocations", []) if a["task_id"] in ["ENG-014", "T01"]), None)
    assert eng14_alloc is not None
    assert eng14_alloc["start_slot"] >= 32  # ~08:00 or later
    
    # 5. Introduce Track Disruption on S01
    disrupt_res = client.post("/api/disruptions/apply", json={
        "disruption_type": "Track Blocked",
        "section_id": "S01",
        "description": "Emergency rail defect between MS and CGL",
        "task_id": "ENG-014",
        "duration_minutes": 240,
    })
    assert disrupt_res.status_code == 200
    disrupt_data = disrupt_res.json()
    
    # Verify Daily plan replans
    assert disrupt_data.get("replan_success", True) is True
    
    # Verify Weekly commitment evaluated
    upstream = disrupt_data.get("upstream_impact", {})
    assert "weekly_impact_status" in upstream
    
    # Verify Monthly plan remains stable unless disruption is unrecoverable
    m_check = client.get("/api/horizons/monthly")
    assert m_check.status_code == 200
```

**Step 2: Run test and verify it passes**

Run: `pytest tests/test_multi_horizon_deterministic_scenario.py -v`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/test_multi_horizon_deterministic_scenario.py
git commit -m "test: add deterministic multi-horizon workflow test per prompt spec Section 53"
```

---

### Task 8: Frontend Multi-Horizon State & API Client

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/context/ScenarioContext.jsx`

**Step 1: Implement API methods in `frontend/src/api.js`**

Add:
- `fetchHorizonOverview()`
- `fetchMonthlyPlan()`
- `optimizeMonthlyPlan()`
- `runMonthlyLns()`
- `approveMonthlyPlan(mode, notes)`
- `fetchMonthlyImpact(taskId, newWeek)`
- `fetchWeeklyPlan(weekNum)`
- `optimizeWeeklyPlan(weekNum)`
- `runWeeklyLns(weekNum)`
- `approveWeeklyPlan(weekNum, mode, notes)`
- `fetchWeeklyImpact(taskId, newDay, newWindow)`
- `fetchTaskTraceability(taskId)`
- `fetchHorizonReport(horizon)`

**Step 2: Update `ScenarioContext.jsx`**

- Add state:
  - `activeHorizon`: `'day'` | `'week'` | `'month'`
  - `selectedWeekNum`: default based on `planning_date` (e.g. 3)
  - `horizonOverview`: summary metrics for month, week, day
  - `monthlyPlan`: current monthly plan object
  - `weeklyPlan`: current weekly plan object
  - `selectedTraceTask`: task for modal traceability
  - `downstreamImpact`: result of proposed change
  - `upstreamImpact`: result of daily disruption
- Add actions:
  - `setActiveHorizon(h)`
  - `setSelectedWeekNum(w)`
  - `optimizeMonth()`, `runMonthLns()`, `approveMonth()`
  - `optimizeWeek()`, `runWeekLns()`, `approveWeek()`
  - `inspectTaskTraceability(taskId)`
  - `checkDownstreamImpact(taskId, changes)`
  - `downloadHorizonReport(horizon)`

**Step 3: Test with quick frontend build or dry-run**

Run: `npm --prefix frontend run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/api.js frontend/src/context/ScenarioContext.jsx
git commit -m "feat(frontend): integrate multi-horizon API methods and scenario context state"
```

---

### Task 9: Multi-Horizon Dashboard Header & Horizon Switcher

**Files:**
- Create: `frontend/src/components/MultiHorizonDashboard.jsx`
- Modify: `frontend/src/components/Header.jsx`

**Step 1: Implement `MultiHorizonDashboard.jsx`**

- Multi-Horizon Dashboard banner:
  - `MONTHLY` (Month name, Tasks count, Planned count, Deferred count, Critical count, Total Possession hours)
  - `THIS WEEK` (Week label e.g. 14–20 Sep, Tasks count, Approved count, Pending count, Possession hours)
  - `TODAY` (Planning date e.g. 18 Sep, Active possessions count, Affected trains count, Conflicts count)
- Horizon Switcher:
  - `[MONTH]` `[WEEK]` `[DAY]` pills with clean railway styling and active indicator.
  - Linked version tags: `M-2026-09-v1` → `W-W3-v1` → `D-18SEP-v1`.
  - Planning date selector allowing user to change planning date (deriving Month and Week dynamically).
- Quick Report button: generates formal Monthly/Weekly/Daily report.

**Step 2: Update `Header.jsx`**

- Integrate `MultiHorizonDashboard` into Header so it is prominently accessible.

**Step 3: Verify build**

Run: `npm --prefix frontend run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/components/MultiHorizonDashboard.jsx frontend/src/components/Header.jsx
git commit -m "feat(ui): add multi-horizon dashboard header and horizon switcher"
```

---

### Task 10: Monthly Maintenance Planning View

**Files:**
- Create: `frontend/src/components/MonthlyPlannerView.jsx`
- Test: manual visual verification + build

**Step 1: Implement `MonthlyPlannerView.jsx`**

- **Left Column: Filters**
  - Department (All, Engineering, S&T, Electrical)
  - Section (All, MS-CGL, CGL-VM, VM-VRI, etc.)
  - Priority (Critical, High, Medium, Low)
  - Criticality
  - Status (Proposed, Prioritized, Approved, Deferred)
- **Center Column: Calendar & Timeline Views**
  - Toggle between:
    - **Monthly Calendar**: Weeks 1 to 4 with daily possession density, active departments, critical maintenance indicators, track availability, restrained operational colors.
    - **Monthly Timeline View**: Corridor sections on Y-axis (MS-CGL, CGL-VM, VM-VRI, VRI-ALU, ALU-TPJ, etc.) and Week 1–4 on X-axis showing scheduled maintenance blocks.
  - Drill-down: Clicking any Week (e.g. Week 3) or clicking a task smoothly switches to that Week in the Weekly Planner!
- **Bottom Panels:**
  - **Weekly Capacity Cards**:
    - Week 1..4: Requested hours, Available hours (56h), Utilization %.
    - If overloaded: visual alert `CAPACITY OVERLOAD` + optimizer suggestions (defer, bundle, shift).
  - **Department Workload**:
    - Engineering, TRD/OHE, S&T: Tasks, Possession Hours, Utilization %.
  - **Multi-Department Bundling (Joint Possessions)**:
    - Displays detected joint possessions (e.g. Track Tamping 120m + OHE Inspection 60m on S01 -> 135m joint possession, saving 45 min).
  - **Asset Availability**:
    - Before vs After maintenance status for sections.
- **Right Column: Selected Task Inspector**
  - Task ID, Department, Asset, Section, Work Type, Priority, Criticality
  - Estimated Duration, P50, P90
  - Requested Window, Preferred Week, Required Resources, Required Possession
  - Expected Train Impact (clearly labeled `ESTIMATED`)
  - **"WHY THIS WEEK?"** explanation card
  - Action buttons: "Move Week", "Bundle", "Defer", "Trace Task"
- **Top Actions Bar:**
  - "Optimize Monthly Plan", "Run Monthly LNS", "Approval Workflow" (Draft → Review → Approved), "Download Monthly Report".

**Step 2: Verify build**

Run: `npm --prefix frontend run build`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/MonthlyPlannerView.jsx
git commit -m "feat(ui): implement monthly maintenance planning view with calendar, timeline, capacity, and bundling"
```

---

### Task 11: Weekly Possession Planning View

**Files:**
- Create: `frontend/src/components/WeeklyPlannerView.jsx`
- Test: manual visual verification + build

**Step 1: Implement `WeeklyPlannerView.jsx`**

- **Top Bar:**
  - Week selector (Week 1, Week 2, Week 3, Week 4) with dates (e.g. 14–20 September 2026).
  - Actions: "Optimize Week", "Run Weekly LNS", "Approval Workflow" (Candidate → Review → Approved), "Weekly Report".
- **Left Column: Infrastructure & Sections**
  - List of corridor sections with active tracks, loop availability, and weekly block count.
- **Center Column: Time-Space Weekly Grid**
  - Monday to Sunday columns.
  - Time bands: 00:00 to 24:00.
  - Interactive maintenance block cards displaying:
    - Task ID, Department badge, Section, Planned Window, Duration, Affected Track.
    - Multi-department joint possession badge if bundled.
    - Train Impact badge (e.g. "3 services affected").
  - Drill-down: Clicking any day (e.g. Wednesday) switches to the 24-Hour Block Planner for that day!
- **Bottom Panels:**
  - **Weekly Conflict Detection**:
    - Displays detected clashes (same track, section, crew, machine, window) with Conflict ID, Tasks, Resource, Time, Reason, and Resolution.
  - **Department Weekly Workload & Crew Utilization**.
  - **Weekly Train Impact Summary**:
    - Total affected passenger/freight services, delay exposure, loop holding alternatives.
- **Right Column: Selected Task / Possession Inspector**
  - Task, Section, Department, Window, Duration, Track, Possession type.
  - Train impact breakdown: affected train numbers, potential delay, loop availability.
  - **"WHY THIS DAY?"** explanation card.
  - Action buttons: "Move Day", "Adjust Window", "Drill to Daily Plan", "Trace Task".

**Step 2: Verify build**

Run: `npm --prefix frontend run build`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/WeeklyPlannerView.jsx
git commit -m "feat(ui): implement weekly possession planning view with day grid, conflict detection, and train impact"
```

---

### Task 12: Daily Operational Planner Integration & Traceability Modal

**Files:**
- Modify: `frontend/src/components/BlockPlannerTab.jsx`
- Create: `frontend/src/components/TraceabilityModal.jsx`
- Create: `frontend/src/components/DownstreamImpactModal.jsx`
- Create: `frontend/src/components/HorizonReportsModal.jsx`
- Modify: `frontend/src/App.jsx`

**Step 1: Enhance `BlockPlannerTab.jsx`**

- Add Multi-Horizon Breadcrumb at the top:
  `September 2026` > `Week 3 (14–20 Sep)` > `Wednesday 16 Sep / Friday 18 Sep (Operational Authority)`
- Add Multi-Horizon Traceability Card in the task inspector:
  Shows `Monthly Plan ID` (`M-2026-09-v1`, Preferred Week 3), `Weekly Plan ID` (`W-2026-09-W3-v1`, Wednesday 08:00–12:00), `Daily Plan ID` (`D-2026-09-18-v1`, 08:45–10:30 Track 1).
- Add "WHY 08:45–10:30?" operational explanation card.
- Add Upstream Impact Card when a disruption is simulated/applied:
  Shows `WEEKLY PLAN UNAFFECTED` or `WEEKLY REVIEW REQUIRED`, explaining whether the weekly target is still achievable.

**Step 2: Implement Modals**

- `TraceabilityModal.jsx`:
  Renders the complete 4-tier chain:
  `MONTHLY` → `WEEKLY` → `DAILY` → `OPERATIONAL RESULT`.
- `DownstreamImpactModal.jsx`:
  Displays `3 downstream allocations will require replanning` with affected weekly and daily plans, train movements, and joint possessions when a monthly/weekly change is initiated.
- `HorizonReportsModal.jsx`:
  Renders formal Monthly, Weekly, and Daily reports with download option.

**Step 3: Update `App.jsx`**

- Wire the horizon switcher into `AppContent`:
  - When active tab is `planner`, dynamically render `MonthlyPlannerView`, `WeeklyPlannerView`, or `DailyPlannerView` (BlockPlannerTab) based on `activeHorizon`.
  - Seamless navigation between tabs and horizons.

**Step 4: Verify build and smoke test**

Run: `npm --prefix frontend run build`
Run: `python smoke_test.py`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/BlockPlannerTab.jsx frontend/src/components/TraceabilityModal.jsx frontend/src/components/DownstreamImpactModal.jsx frontend/src/components/HorizonReportsModal.jsx frontend/src/App.jsx
git commit -m "feat(ui): connect multi-horizon views, traceability modal, and impact reports"
```

---

### Task 13: Full System Verification & End-to-End Testing

**Files:**
- Test: All tests in `tests/`
- Verification: End-to-end API and UI smoke tests

**Step 1: Run all backend tests**

Run: `pytest`
Expected: All tests pass (100% green)

**Step 2: Run frontend build**

Run: `npm --prefix frontend run build`
Expected: Zero build errors

**Step 3: Run comprehensive smoke test**

Run: `python smoke_test.py`
Expected: Success on all endpoints

**Step 4: Commit**

```bash
git add .
git commit -m "chore: complete multi-time-horizon planning verification"
```
