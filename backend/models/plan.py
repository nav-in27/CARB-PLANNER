"""
CARB-Planner Domain Models — Plan & KPIs
Pydantic models for block plan output, disruptions, and KPI metrics.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from backend.models.task import MaintenanceTask, TaskStatus
from backend.models.train import Train


class BlockAllocation(BaseModel):
    """A single allocated maintenance block with loop line and multi-department coordination."""
    task_id: str
    section_id: str
    track_id: Optional[str] = None
    start_slot: int
    end_slot: int
    duration_slots: int
    department: str
    status: TaskStatus = TaskStatus.SCHEDULED
    is_bundled: bool = False
    bundled_with: List[str] = Field(default_factory=list, description="Task IDs bundled in same possession")
    loop_routed_trains: List[str] = Field(default_factory=list, description="Trains routed via loop lines during this block")
    affected_trains: List[str] = Field(default_factory=list, description="Train numbers or IDs affected during this block")
    single_line_working_active: bool = False


class DisruptionType(str, Enum):
    """All 9 supported disruption types for the CARB-Planner system."""
    CRITICAL_DEFECT = "Critical Defect"
    BLOCK_CANCELLATION = "Block Cancellation"
    DEPARTMENT_CONFLICT = "Department Conflict"
    MAINTENANCE_OVERRUN = "Maintenance Overrun"
    TRAIN_DELAY = "Train Delay"
    TRACK_BLOCKED = "Track Blocked"
    LOOP_UNAVAILABLE = "Loop Unavailable"
    SIGNAL_FAILURE = "Signal Failure"
    TRAIN_CANCELLATION = "Train Cancellation"


class DisruptionEvent(BaseModel):
    """A disruption that invalidates part of the current plan."""
    disruption_id: str
    disruption_type: DisruptionType
    affected_section: str
    affected_start_slot: Optional[int] = None
    affected_end_slot: Optional[int] = None
    description: str = ""
    new_task: Optional[MaintenanceTask] = None
    cancelled_task_id: Optional[str] = None
    overrun_minutes: Optional[int] = 0
    duration_minutes: Optional[int] = 0
    affected_train_ids: List[str] = Field(default_factory=list)
    affected_loop_id: Optional[str] = None
    delay_minutes: Optional[int] = None
    severity: str = "CRITICAL"  # CRITICAL | WARNING | ADVISORY


class DisruptionImpactPreview(BaseModel):
    """Non-mutating disruption impact analysis result."""
    disruption_id: str
    disruption_type: str
    affected_section: str
    description: str = ""
    # Impact metrics
    trains_affected: int = 0
    trains_delayed: int = 0
    trains_rerouted: int = 0
    trains_cancelled: int = 0
    tasks_affected: int = 0
    tasks_displaced: int = 0
    total_delay_impact_min: int = 0
    max_delay_impact_min: int = 0
    # Affected entity lists
    affected_train_numbers: List[str] = Field(default_factory=list)
    affected_task_ids: List[str] = Field(default_factory=list)
    affected_sections: List[str] = Field(default_factory=list)
    affected_loops: List[str] = Field(default_factory=list)
    # Resolution options
    resolution_options: List[Dict[str, Any]] = Field(default_factory=list)
    estimated_replan_time_sec: float = 0.0
    # Status
    severity: str = "CRITICAL"
    recommendation: str = ""
    feasible_after_apply: bool = True


class PlanKPIs(BaseModel):
    """Key performance indicators computed from a schedule."""
    asset_availability_pct: float = Field(0.0, description="% of section-time available")
    maintenance_completion_pct: float = Field(0.0, description="% of requested tasks scheduled")
    maintenance_completed: int = 0
    maintenance_total: int = 0
    maintenance_deferred: int = 0
    total_train_delay_min: int = 0
    avg_train_delay_min: float = 0.0
    cancelled_trains: int = 0
    rerouted_trains: int = 0
    conflicts: int = 0
    critical_tasks_scheduled: int = 0
    critical_tasks_total: int = 0
    active_blocks: int = 0
    replan_time_sec: float = 0.0
    
    # Real-world railway block KPIs
    loop_utilizations_count: int = 0
    bundled_possessions_count: int = 0
    time_saved_bundling_min: int = 0
    frozen_tasks_ratio_pct: float = 0.0


class SchedulePlan(BaseModel):
    """Complete optimized block plan output."""
    plan_id: str = "plan_001"
    scenario_id: str = "SCN_GST_2026_09_18"
    status: str = "NOT_RUN"
    generated_at: Optional[str] = None
    algorithm_version: str = "CP-SAT+LNS-2026.09"
    objective_value: float = 0.0
    feasibility_status: str = "NOT_RUN"
    horizon_slots: int = 96
    slot_duration_min: int = 15
    allocations: List[BlockAllocation] = Field(default_factory=list)
    tasks: List[MaintenanceTask] = Field(default_factory=list)
    trains: List[Train] = Field(default_factory=list)
    train_assignments: List[Dict[str, Any]] = Field(default_factory=list)
    maintenance_assignments: List[Dict[str, Any]] = Field(default_factory=list)
    track_occupancies: List[Dict[str, Any]] = Field(default_factory=list)
    loop_assignments: List[Dict[str, Any]] = Field(default_factory=list)
    station_assignments: List[Dict[str, Any]] = Field(default_factory=list)
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    unassigned_movements: List[Dict[str, Any]] = Field(default_factory=list)
    delay_metrics: Dict[str, Any] = Field(default_factory=dict)
    asset_metrics: Dict[str, Any] = Field(default_factory=dict)
    explanations: Dict[str, Any] = Field(default_factory=dict)
    optimization_metadata: Dict[str, Any] = Field(default_factory=dict)
    kpis: PlanKPIs = Field(default_factory=PlanKPIs)
    solver_status: str = "NOT_RUN"
    solve_time_sec: float = 0.0
    is_feasible: bool = False
    infeasibility_reason: Optional[str] = None
    
    # Advanced operational coordination outputs
    loop_routing_decisions: List[dict] = Field(default_factory=list)
    bundled_possessions: List[dict] = Field(default_factory=list)
    frozen_tasks_count: int = 0
    data_mode: str = "REAL_INFRASTRUCTURE_SIM_OPERATIONS"


class TaskExplanation(BaseModel):
    """Structured explanation for a task decision generated from optimizer constraints."""
    task_id: str
    status: TaskStatus
    section_id: str
    allocated_window: Optional[str] = None
    reason_lines: List[str] = Field(default_factory=list)
    competing_task_id: Optional[str] = None
    competing_reason: Optional[str] = None
    alternative_window: Optional[str] = None
    loop_alternative_evaluated: Optional[str] = None
    bundled_with_task: Optional[str] = None
    decision_confidence: str = "Medium"
    risk_level: str = "LOW"
    priority: str = "Medium"
    p50_duration_min: Optional[int] = None
    p90_duration_min: Optional[int] = None
