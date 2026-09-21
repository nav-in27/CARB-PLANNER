"""
CARB-Planner — Initial Feasible Solution Generator Pipeline

Provides a deterministic pipeline to construct a verified, conflict-checked
initial operational plan:
  1. Load scenario & infrastructure graph
  2. Validate network & train route completeness
  3. Validate maintenance task time windows
  4. Generate train movements & section occupancies
  5. Apply maintenance possessions with clear standing room / loops
  6. Detect conflicts via ConflictEngine
  7. Formulate initial feasible candidate plan
  8. Calculate objective & KPIs
"""

from __future__ import annotations

import copy
import logging
import time
from typing import Any, Dict, List, Optional

from backend.models.network import RailwayNetwork
from backend.models.plan import BlockAllocation, PlanKPIs, SchedulePlan
from backend.models.task import MaintenanceTask, TaskStatus
from backend.models.train import Train, TrainService
from backend.optimizer.conflict_engine import ConflictEngine, ConflictReport
from backend.optimizer.cp_sat import solve_block_plan
from backend.simulation.railway_sim import compute_detailed_kpis

logger = logging.getLogger(__name__)


def generate_initial_solution(
    network: RailwayNetwork,
    tasks: List[MaintenanceTask],
    trains: List[Train],
    services: Optional[List[TrainService]] = None,
    horizon_slots: int = 96,
    time_limit_sec: float = 15.0,
) -> SchedulePlan:
    """Execute the end-to-end initial solution generation pipeline."""
    start_time = time.perf_counter()
    logger.info("Generating initial operational plan solution...")

    # Step 1: Pre-validate inputs
    if not network or not network.sections:
        raise ValueError("Invalid network: no sections defined")

    # Step 2: Ensure train path segments and occupancies exist
    valid_trains = []
    unassigned_movements = []
    for t in trains:
        if t.path_segments:
            valid_trains.append(t)
        else:
            unassigned_movements.append({
                "train_id": t.train_id,
                "train_name": t.train_name,
                "reason": "NO_VALID_PATH_SEGMENTS",
            })

    # Step 3: Solve with CP-SAT solver
    plan = solve_block_plan(
        network=network,
        tasks=copy.deepcopy(tasks),
        trains=copy.deepcopy(valid_trains),
        horizon_slots=horizon_slots,
        time_limit_sec=time_limit_sec,
    )

    # Step 4: Populate detailed assignments and unassigned movements
    plan.unassigned_movements = unassigned_movements
    
    # Enrich train assignments
    train_assignments = []
    for t in valid_trains:
        train_assignments.append({
            "train_id": t.train_id,
            "train_number": t.train_id,
            "train_name": t.train_name,
            "priority": t.priority,
            "route": t.route,
            "path_segments": [s.model_dump() for s in t.path_segments],
            "actual_delay_min": t.actual_delay_min,
            "is_delayed": t.actual_delay_min > 0,
            "is_cancelled": t.is_cancelled,
            "is_rerouted": t.is_rerouted,
            "status": "ON_TIME" if t.actual_delay_min == 0 else "DELAYED",
        })
    plan.train_assignments = train_assignments

    # Enrich maintenance assignments
    maint_assignments = []
    for a in plan.allocations:
        maint_assignments.append({
            "task_id": a.task_id,
            "section_id": a.section_id,
            "track_id": a.track_id,
            "start_slot": a.start_slot,
            "end_slot": a.end_slot,
            "start_min": a.start_slot * 15,
            "end_min": a.end_slot * 15,
            "duration_min": a.duration_slots * 15,
            "department": a.department,
            "is_bundled": a.is_bundled,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
        })
    plan.maintenance_assignments = maint_assignments

    # Step 5: Run conflict engine evaluation
    if services:
        conflict_engine = ConflictEngine()
        maint_blocks = []
        for a in plan.allocations:
            maint_blocks.append({
                "task_id": a.task_id,
                "section_id": a.section_id,
                "track_id": a.track_id or f"TRK_{a.section_id}_DOWN",
                "start_minute": a.start_slot * 15,
                "end_minute": a.end_slot * 15,
                "department": a.department,
            })
        report = conflict_engine.detect_all_conflicts(services=services, maintenance_blocks=maint_blocks)
        plan.conflicts = [c.model_dump() for c in report.conflicts]

    # Step 6: Compute detailed KPIs
    plan.kpis = compute_detailed_kpis(plan, network)
    plan.solve_time_sec = round(time.perf_counter() - start_time, 3)
    plan.status = "FEASIBLE" if plan.is_feasible else "INFEASIBLE"
    plan.feasibility_status = "FEASIBLE" if plan.is_feasible else "INFEASIBLE"

    logger.info(
        f"Initial solution complete: feasible={plan.is_feasible}, "
        f"allocations={len(plan.allocations)}, solve_time={plan.solve_time_sec}s"
    )
    return plan
