"""
CARB-Planner Domain Models — Maintenance Tasks
Pydantic models for maintenance requests, departments, task types, and risk levels.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Department(str, Enum):
    ENGINEERING = "Engineering"
    SNT = "S&T"
    ELECTRICAL = "Electrical"


class TaskType(str, Enum):
    TRACK_INSPECTION = "Track inspection"
    RAIL_GRINDING = "Rail grinding"
    TRACK_MAINTENANCE = "Track maintenance"
    SIGNAL_MAINTENANCE = "Signal maintenance"
    OHE_INSPECTION = "OHE inspection"
    OHE_MAINTENANCE = "OHE maintenance"
    CABLE_MAINTENANCE = "Cable maintenance"


class TaskPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TaskStatus(str, Enum):
    PENDING = "Pending"
    SCHEDULED = "Scheduled"
    DEFERRED = "Deferred"
    RESCHEDULED = "Rescheduled"
    CRITICAL = "Critical"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"


class MaintenanceTask(BaseModel):
    """A maintenance block request from a railway department."""
    task_id: str = Field(..., description="e.g. T01")
    department: Department
    task_type: TaskType
    section_id: str = Field(..., description="Target section")
    priority: TaskPriority = TaskPriority.MEDIUM
    criticality: TaskPriority = TaskPriority.MEDIUM
    asset_age: float = Field(0, ge=0, description="Asset age in years")
    condition_score: float = Field(1.0, ge=0, le=1.0)
    crew_size: int = Field(5, ge=1)
    crew_available: bool = True
    complexity: float = Field(0.5, ge=0, le=1.0)
    weather_factor: float = Field(1.0, ge=0.5, le=2.0)
    historical_duration_min: int = Field(120, ge=15, description="Nominal duration in minutes")
    predicted_p50_min: Optional[int] = None
    predicted_p90_min: Optional[int] = None
    earliest_start_slot: int = Field(0, ge=0, description="Earliest start in 15-min slot index")
    deadline_slot: int = Field(96, ge=0, description="Deadline in 15-min slot index")
    risk_score: float = Field(0.0, ge=0, le=1.0)
    risk_level: RiskLevel = RiskLevel.LOW
    status: TaskStatus = TaskStatus.PENDING
    is_deferrable: bool = True
    defect_count: int = Field(0, ge=0)
    days_since_maintenance: int = Field(30, ge=0)

    # Filled after optimization / operational assignment
    allocated_start_slot: Optional[int] = None
    allocated_end_slot: Optional[int] = None
    explanation: Optional[str] = None
    section_name: Optional[str] = None
    asset_name: Optional[str] = None
    work_type: Optional[str] = None
    affected_tracks: list[str] = Field(default_factory=list)
    affected_trains: list[str] = Field(default_factory=list)
    loop_alternatives: list[str] = Field(default_factory=list)
    decision_context: Optional[dict] = None
    requested_window_str: Optional[str] = None
    planned_block_str: Optional[str] = None
    image_url: Optional[str] = None

    # Multi-Horizon Planning Extensions (Monthly -> Weekly -> Daily -> Operational)
    monthly_plan_id: Optional[str] = None
    preferred_week: Optional[int] = None  # 1, 2, 3, 4
    monthly_status: Optional[str] = "PROPOSED"  # PROPOSED | PRIORITIZED | APPROVED | DEFERRED | COMPLETED | CANCELLED
    weekly_plan_id: Optional[str] = None
    planned_day: Optional[str] = None  # Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
    planned_window: Optional[str] = None  # e.g. "08:00–12:00"
    weekly_status: Optional[str] = "CANDIDATE"  # CANDIDATE | PLANNED | APPROVED | RESCHEDULED | BLOCKED | COMPLETED
    daily_plan_id: Optional[str] = None
    daily_status: Optional[str] = "REQUESTED"  # REQUESTED | PLANNED | ACTIVE | COMPLETED | OVERRUN | REPLANNED | CANCELLED
    required_resources: list[str] = Field(default_factory=list)  # e.g. ["ENG_CREW_01", "CSM_09_TAMP"]
    required_possession_type: Optional[str] = None  # TOTAL_SHUTDOWN | POWER_OHE_ISOLATION | CAUTION_ORDER
    affected_track_id: Optional[str] = None
    expected_train_impact: Optional[int] = None
    due_date: Optional[str] = None
    maintenance_deadline: Optional[str] = None
    bundling_partner_id: Optional[str] = None
    is_joint_possession: bool = False
    why_this_week: Optional[list[str]] = None
    why_this_day: Optional[list[str]] = None
    why_this_window: Optional[list[str]] = None
    alias: Optional[str] = None  # e.g. "T01" for "ENG-014"

