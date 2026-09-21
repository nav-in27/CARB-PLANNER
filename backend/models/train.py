"""
CARB-Planner Domain Models — Trains & Timetable
Pydantic models for train services, timetable movements, time-space occupancy,
and operational priority classification.

Data provenance: Every train service carries data_mode indicating whether
it is sourced from PUBLIC_TIMETABLE data or is a SIMULATION entity.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────

class TrainType(str, Enum):
    """Legacy train type enum — kept for backward compatibility."""
    PASSENGER = "Passenger"
    EXPRESS = "Express"
    FREIGHT = "Freight"


class TrainCategory(str, Enum):
    """Comprehensive train category classification for Indian Railways."""
    VANDE_BHARAT = "Vande Bharat"
    TEJAS = "Tejas"
    SUPERFAST = "Superfast"
    EXPRESS = "Express"
    MAIL = "Mail"
    PASSENGER = "Passenger"
    MEMU_EMU = "MEMU/EMU"
    FREIGHT = "Freight"
    SPECIAL = "Special"


class DataMode(str, Enum):
    """Data provenance mode — distinguishes real timetable data from simulation."""
    REAL_TIMETABLE = "REAL_TIMETABLE"
    PUBLIC_TIMETABLE = "PUBLIC_TIMETABLE"
    SIMULATION = "SIMULATION"


class PriorityClass(str, Enum):
    """Operational priority classification for planning.
    NOTE: These are PROTOTYPE planning priorities, not official Indian Railways rules.
    """
    P1_CRITICAL = "P1"   # Rajdhani, Vande Bharat, Tejas — protected movements
    P2_HIGH = "P2"       # Superfast, Mail — high priority
    P3_NORMAL = "P3"     # Express, Passenger — normal
    P4_FLEXIBLE = "P4"   # Freight, Special — flexible scheduling


class TrainDirection(str, Enum):
    DOWN = "DOWN"   # Away from origin (MS → CAPE)
    UP = "UP"       # Towards origin (CAPE → MS)


class TrainRunStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    ON_TIME = "ON_TIME"
    DELAYED = "DELAYED"
    REROUTED = "REROUTED"
    HELD = "HELD"
    CANCELLED = "CANCELLED"


# ── Route & Movement Models ────────────────────────────────────────────────────────────

class TrainRoute(BaseModel):
    """Canonical train route record representing station node traversal."""
    train_run_id: str = Field(..., description="Unique train run identifier")
    sequence: int = Field(0, ge=0, description="Sequence in traversal order")
    station_id: str = Field(..., description="Station identifier")
    station_code: str = Field("", description="Station code")
    station_name: str = Field("", description="Station name")
    arrival: Optional[int] = Field(None, description="Arrival time in minutes from midnight")
    departure: Optional[int] = Field(None, description="Departure time in minutes from midnight")
    section_id: Optional[str] = Field(None, description="Section traversed after or before station")
    track_id: Optional[str] = Field(None, description="Directional track edge identifier")
    movement_direction: TrainDirection = TrainDirection.DOWN
    dwell_time: int = Field(0, ge=0, description="Dwell time in minutes (0 for pass-through)")
    platform_id: Optional[str] = None
    route_source: str = Field("SCHEDULED", description="SCHEDULED | INTERPOLATED | REROUTED")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Data confidence score")


class TrainMovement(BaseModel):
    """A single station stop or pass-through point in a train's journey."""
    station_id: str = Field(..., description="Station identifier matching network model")
    station_code: str = Field("", description="Official IR station code e.g. TPJ")
    station_name: str = Field("", description="Station display name")
    sequence: int = Field(0, ge=0, description="Stop sequence number (0 = origin)")
    distance_km: float = Field(0.0, ge=0, description="Distance from origin")

    # Scheduled times (minutes from midnight, 0-1440)
    scheduled_arrival: Optional[int] = Field(None, description="Scheduled arrival in minutes from midnight")
    scheduled_departure: Optional[int] = Field(None, description="Scheduled departure in minutes from midnight")
    halt_minutes: int = Field(0, ge=0, description="Scheduled halt duration")

    # Actual times (filled during simulation)
    actual_arrival: Optional[int] = None
    actual_departure: Optional[int] = None

    # Section context
    section_id_before: Optional[str] = Field(None, description="Section traversed to reach this station")
    section_id_after: Optional[str] = Field(None, description="Section traversed after departing this station")

    # Platform / track (if verified)
    platform_number: Optional[int] = None
    track_id: Optional[str] = None
    platform_verified: bool = False

    # Pass-through and provenance indicators
    is_pass_through: bool = Field(False, description="True if train passes through without scheduled passenger halt")
    route_source: str = Field("SCHEDULED", description="SCHEDULED | INTERPOLATED | REROUTED")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Data confidence score")


class TimeSpaceOccupancy(BaseModel):
    """Time-space occupancy record for conflict detection.
    Represents a train occupying a section during a time window.
    """
    train_id: str
    train_number: str = ""
    section_id: str
    track_id: Optional[str] = None
    entry_time_min: int = Field(..., ge=0, description="Entry time in minutes from midnight")
    exit_time_min: int = Field(..., ge=0, description="Exit time in minutes from midnight")
    direction: TrainDirection = TrainDirection.DOWN

    @property
    def entry_slot(self) -> int:
        """Convert to 15-minute slot index."""
        return self.entry_time_min // 15

    @property
    def exit_slot(self) -> int:
        """Convert to 15-minute slot index (rounded up)."""
        return (self.exit_time_min + 14) // 15


# ── Train Service Model ───────────────────────────────────────────────────────

class TrainService(BaseModel):
    """Master train service definition with full timetable.

    This represents a TRAIN SERVICE (e.g. 12635 Vaigai SF Express),
    not a specific dated run.
    """
    train_id: str = Field(..., description="Internal unique ID")
    train_number: str = Field(..., description="Official train number e.g. 12635")
    train_name: str = Field(..., description="Official train name e.g. Vaigai SF Express")
    category: TrainCategory = TrainCategory.EXPRESS
    priority_class: PriorityClass = PriorityClass.P3_NORMAL

    # Route info
    source_station: str = Field(..., description="Origin station code")
    source_station_name: str = Field("", description="Origin station name")
    destination_station: str = Field(..., description="Destination station code")
    destination_station_name: str = Field("", description="Destination station name")
    direction: TrainDirection = TrainDirection.DOWN
    total_distance_km: float = Field(0.0, ge=0)

    # Operating info
    operating_days: str = Field("Daily", description="e.g. Daily, Mon-Sat, Except Wed")
    runs_on_day: bool = Field(True, description="Whether this train runs on the planning date")

    # Station-by-station timetable
    movements: List[TrainMovement] = Field(default_factory=list)

    # Time-space occupancy (computed from movements)
    occupancy: List[TimeSpaceOccupancy] = Field(default_factory=list)

    # Delay cost for optimizer
    delay_cost_per_min: float = Field(1.0, ge=0, description="Penalty per minute of delay")

    # Data provenance
    data_mode: DataMode = DataMode.PUBLIC_TIMETABLE
    source: str = Field("Public timetable aggregators (eRail.in, ConfirmTkt.com, RailYatri.in)")
    source_url: str = Field("https://erail.in")
    data_version: str = Field("2026-09-18", description="Timetable retrieval date")

    # Simulation state (filled by optimizer)
    actual_delay_min: int = Field(0, ge=0)
    is_cancelled: bool = False
    is_rerouted: bool = False
    is_held: bool = False
    held_at_station: Optional[str] = None
    loop_used: Optional[str] = None
    planner_decision: Optional[str] = None

    def compute_occupancy(self) -> None:
        """Compute time-space occupancy from station movements."""
        self.occupancy = []
        for i in range(len(self.movements) - 1):
            curr = self.movements[i]
            nxt = self.movements[i + 1]

            section_id = curr.section_id_after or nxt.section_id_before
            if not section_id:
                continue

            dep_time = curr.scheduled_departure if curr.scheduled_departure is not None else curr.scheduled_arrival
            arr_time = nxt.scheduled_arrival if nxt.scheduled_arrival is not None else nxt.scheduled_departure

            if dep_time is None or arr_time is None:
                continue

            # Handle overnight trains (arrival next day)
            exit_time = arr_time
            if exit_time < dep_time:
                exit_time += 1440  # Next day

            track_id = curr.track_id or f"TRK_{section_id}_{self.direction.value}"

            self.occupancy.append(TimeSpaceOccupancy(
                train_id=self.train_id,
                train_number=self.train_number,
                section_id=section_id,
                track_id=track_id,
                entry_time_min=dep_time,
                exit_time_min=exit_time,
                direction=self.direction,
            ))

    def get_routes(self) -> List[TrainRoute]:
        """Convert movements into canonical TrainRoute sequence."""
        routes: List[TrainRoute] = []
        for m in self.movements:
            routes.append(TrainRoute(
                train_run_id=f"RUN_{self.train_number}",
                sequence=m.sequence,
                station_id=m.station_id,
                station_code=m.station_code,
                station_name=m.station_name,
                arrival=m.scheduled_arrival,
                departure=m.scheduled_departure,
                section_id=m.section_id_after or m.section_id_before,
                track_id=m.track_id,
                movement_direction=self.direction,
                dwell_time=m.halt_minutes,
                route_source=m.route_source,
                confidence=m.confidence,
            ))
        return routes

    def validate_route_continuity(self) -> List[str]:
        """Detect any section or topological gaps in the route."""
        errors: List[str] = []
        for i in range(len(self.movements) - 1):
            curr = self.movements[i]
            nxt = self.movements[i + 1]
            if not curr.section_id_after and not nxt.section_id_before:
                errors.append(f"Missing section link between {curr.station_code} and {nxt.station_code}")
        return errors

    def to_legacy(self) -> "Train":
        """Convert to legacy Train model for backward compatibility."""
        from backend.models.train import TrainPathSegment

        # Map category to legacy type
        type_map = {
            TrainCategory.FREIGHT: TrainType.FREIGHT,
            TrainCategory.PASSENGER: TrainType.PASSENGER,
            TrainCategory.MEMU_EMU: TrainType.PASSENGER,
        }
        legacy_type = type_map.get(self.category, TrainType.EXPRESS)

        # Map priority class to numeric
        priority_map = {
            PriorityClass.P1_CRITICAL: 10,
            PriorityClass.P2_HIGH: 7,
            PriorityClass.P3_NORMAL: 5,
            PriorityClass.P4_FLEXIBLE: 2,
        }

        # Build path segments from occupancy
        self.compute_occupancy()
        segments = []
        route_sections = []
        for occ in self.occupancy:
            route_sections.append(occ.section_id)
            segments.append(TrainPathSegment(
                section_id=occ.section_id,
                entry_slot=occ.entry_slot,
                exit_slot=occ.exit_slot,
            ))

        return Train(
            train_id=self.train_id,
            train_name=f"{self.train_number} {self.train_name}",
            train_type=legacy_type,
            priority=priority_map.get(self.priority_class, 5),
            delay_cost_per_min=self.delay_cost_per_min,
            route=route_sections,
            path_segments=segments,
            actual_delay_min=self.actual_delay_min,
            is_cancelled=self.is_cancelled,
            is_rerouted=self.is_rerouted,
        )


class TrainRun(BaseModel):
    """A dated instance of a train service running on a specific date."""
    run_id: str
    train_id: str
    train_number: str = ""
    journey_date: str = Field(..., description="ISO date string YYYY-MM-DD")
    direction: TrainDirection = TrainDirection.DOWN
    status: TrainRunStatus = TrainRunStatus.SCHEDULED
    movements: List[TrainMovement] = Field(default_factory=list)


# ── Legacy Model (Backward Compatibility) ─────────────────────────────────────

class TrainPathSegment(BaseModel):
    """One leg of a train's journey through a section."""
    section_id: str
    entry_slot: int = Field(..., ge=0, description="15-min slot index when train enters section")
    exit_slot: int = Field(..., ge=0, description="15-min slot index when train exits section")


class Train(BaseModel):
    """A train movement across the network in one day.
    LEGACY MODEL — preserved for backward compatibility with existing optimizer.
    New code should use TrainService instead.
    """
    train_id: str = Field(..., description="e.g. 12001")
    train_name: str = Field("", description="Display name")
    train_type: TrainType = TrainType.PASSENGER
    priority: int = Field(1, ge=1, le=10, description="Higher = more important")
    delay_cost_per_min: float = Field(1.0, ge=0, description="Penalty per minute of delay")
    route: List[str] = Field(default_factory=list, description="Ordered list of section_ids")
    path_segments: List[TrainPathSegment] = Field(default_factory=list)
    actual_delay_min: int = Field(0, ge=0, description="Computed after optimization")
    is_cancelled: bool = False
    is_rerouted: bool = False


# ── Timetable Container ───────────────────────────────────────────────────────

class CorridorTimetable(BaseModel):
    """Complete timetable for a railway corridor."""
    corridor_name: str = "Southern Railway Chennai–Kanniyakumari Grand South Trunk Corridor"
    planning_date: str = Field("2026-09-18", description="Date for which timetable is loaded")
    timetable_version: str = Field("2026-09-18", description="Source timetable effective date")
    source: str = "Public timetable aggregators (eRail.in, ConfirmTkt.com, RailYatri.in)"
    source_url: str = "https://erail.in"
    data_mode: DataMode = DataMode.PUBLIC_TIMETABLE
    limitations: str = "Timings sourced from public aggregator sites. May differ from official Working Time Table (WTT)."

    services: List[TrainService] = Field(default_factory=list)
    total_services: int = 0
    down_services: int = 0
    up_services: int = 0
    real_services: int = 0
    simulated_services: int = 0

    def compute_stats(self):
        self.total_services = len(self.services)
        self.down_services = sum(1 for s in self.services if s.direction == TrainDirection.DOWN)
        self.up_services = sum(1 for s in self.services if s.direction == TrainDirection.UP)
        self.real_services = sum(1 for s in self.services if s.data_mode == DataMode.PUBLIC_TIMETABLE)
        self.simulated_services = sum(1 for s in self.services if s.data_mode == DataMode.SIMULATION)
