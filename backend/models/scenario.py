"""
CARB-Planner — Canonical Planning Scenario & Corridor Domain Models
Defines the single source of truth for railway network, corridor,
timetable version, planning date, maintenance tasks, train runs,
conflicts, and optimization state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SystemMode(str, Enum):
    PUBLIC_TIMETABLE = "PUBLIC_TIMETABLE"
    SIMULATION = "SIMULATION"
    LIVE_DATA = "LIVE_DATA"


class CorridorConfig(BaseModel):
    """Authoritative railway corridor configuration."""
    corridor_id: str = "SR_GST_01"
    name: str = "Southern Railway Grand South Trunk Corridor"
    short_name: str = "MS ↔ CAPE"
    origin: str = "Chennai Egmore (MS)"
    origin_code: str = "MS"
    destination: str = "Kanniyakumari (CAPE)"
    destination_code: str = "CAPE"
    total_distance_km: float = 742.0
    zone: str = "Southern Railway (SR)"
    divisions: List[str] = Field(
        default_factory=lambda: [
            "Chennai (MAS)",
            "Tiruchirappalli (TPJ)",
            "Madurai (MDU)",
            "Thiruvananthapuram (TVC)",
        ]
    )
    electrification: str = "25 kV AC 50 Hz OHE (100% Electrified)"
    gauge: str = "Broad Gauge 1676 mm"
    state: str = "Tamil Nadu (100% within State)"
    planning_directions: List[str] = Field(
        default_factory=lambda: ["BOTH", "DOWN", "UP"]
    )
    source: str = "Southern Railway Official Working Time Table (WTT) & OpenRailwayMap"
    source_url: str = "https://sr.indianrailways.gov.in"
    data_version: str = "SR-GST-2026-V2"
    effective_date: str = "2026-09-18"
    verification_status: str = "publicly verified"
    alternate_routes: List[Dict[str, Any]] = Field(default_factory=list)


class ConflictItem(BaseModel):
    """Detailed conflict object describing an infrastructure, train, or possession clash."""
    conflict_id: str
    conflict_type: str  # POSSESSION_OVERLAP | TRACK_CAPACITY | OPPOSING_DIRECTION | CROSSING_LOOP_OVERLAP | HEADWAY_VIOLATION
    severity: str = "CRITICAL"  # CRITICAL | WARNING | ADVISORY
    time_str: str = "08:45"
    start_minute: int = 525
    end_minute: int = 630
    section_id: str = "S04"
    section_name: str = "Vriddhachalam – Ariyalur"
    track_id: Optional[str] = "TRK_S04_SINGLE"
    station_code: Optional[str] = "VRI"
    train_numbers: List[str] = Field(default_factory=list)
    task_id: Optional[str] = None
    resource: str = "Track 1 (Single Line)"
    reason: str = "Train movement intersects planned engineering possession."
    resolution: str = "Train held in crossing loop / alternate route evaluated."
    status: str = "ACTIVE"  # ACTIVE | RESOLVED | REGULATED


class ScenarioVersion(BaseModel):
    """Immutable snapshot of a planning scenario version."""
    version_number: int = 1
    version_id: str = Field(default_factory=lambda: f"VER_{uuid.uuid4().hex[:8].upper()}")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    reason: str = "Initial baseline plan"
    trigger: str = "PLAN_GENERATE"  # PLAN_GENERATE | DISRUPTION_APPLY | LNS_OPTIMIZE | MANUAL_EDIT
    plan_snapshot_id: Optional[str] = None
    kpi_snapshot: Dict[str, Any] = Field(default_factory=dict)
    diff_summary: Dict[str, Any] = Field(default_factory=dict)


class AuditLogEntry(BaseModel):
    """Immutable audit log entry for plan changes."""
    entry_id: str = Field(default_factory=lambda: f"AUD_{uuid.uuid4().hex[:8].upper()}")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    action: str = "PLAN_GENERATE"  # PLAN_GENERATE | DISRUPTION_SIMULATE | DISRUPTION_APPLY | LNS_RUN | APPROVAL | OVERRIDE
    actor: str = "system"  # system | controller_name
    version_before: Optional[int] = None
    version_after: Optional[int] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    rationale: str = ""
    reason: Optional[str] = None


class PlanningScenario(BaseModel):
    """
    The Single Source of Truth for the CARB-Planner application.
    Represents the full operational state across geography, timetable,
    possessions, conflicts, and optimization decisions.
    """
    scenario_id: str = "SCN_GST_2026_09_18"
    corridor: CorridorConfig = Field(default_factory=CorridorConfig)
    planning_date: str = "2026-09-18"
    timetable_version: str = "SR-WTT-2026-V1"
    network_version: str = "SR-GIS-TN-V2"
    data_mode: SystemMode = SystemMode.PUBLIC_TIMETABLE

    # Version tracking
    version_number: int = 1
    version_history: List[ScenarioVersion] = Field(default_factory=list)
    audit_log: List[AuditLogEntry] = Field(default_factory=list)
    
    # Active filters
    selected_sections: List[str] = Field(default_factory=list)
    selected_direction: str = "BOTH"
    
    # Core entities
    stations_count: int = 14
    sections_count: int = 26
    tracks_count: int = 26
    loops_count: int = 12
    sidings_count: int = 10
    yards_count: int = 5

    # Entity ID references
    train_run_ids: List[str] = Field(default_factory=list)
    maintenance_task_ids: List[str] = Field(default_factory=list)
    
    # Live operational data
    tasks: List[Dict[str, Any]] = Field(default_factory=list)
    train_services: List[Dict[str, Any]] = Field(default_factory=list)
    conflicts: List[ConflictItem] = Field(default_factory=list)
    loop_utilization: List[Dict[str, Any]] = Field(default_factory=list)

    # Network state
    network_state: Dict[str, Any] = Field(default_factory=dict)
    
    # Solver state
    solver_status: str = "FEASIBLE"  # FEASIBLE | OPTIMAL | INFEASIBLE | NOT_RUN
    approval_status: str = "FEASIBLE"  # FEASIBLE | APPROVED | OVERRIDE
    solve_time_sec: float = 0.04
    kpis: Dict[str, Any] = Field(default_factory=dict)

    # Disruption state
    disruption_state: Dict[str, Any] = Field(default_factory=dict)
    
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def increment_version(self, reason: str, trigger: str, kpi_snapshot: dict = None, diff: dict = None) -> int:
        """Increment version and record in history."""
        self.version_number += 1
        version = ScenarioVersion(
            version_number=self.version_number,
            reason=reason,
            trigger=trigger,
            kpi_snapshot=kpi_snapshot or {},
            diff_summary=diff or {},
        )
        self.version_history.append(version)
        self.updated_at = datetime.utcnow().isoformat() + "Z"
        return self.version_number

    def add_audit_entry(self, action: str, actor: str = "system",
                        details: dict = None, rationale: str = "") -> AuditLogEntry:
        """Add an immutable audit log entry."""
        entry = AuditLogEntry(
            action=action,
            actor=actor,
            version_before=self.version_number - 1 if self.version_number > 1 else None,
            version_after=self.version_number,
            details=details or {},
            rationale=rationale,
        )
        self.audit_log.append(entry)
        return entry
