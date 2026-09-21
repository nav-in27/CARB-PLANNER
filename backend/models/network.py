"""
CARB-Planner Domain Models — Network & Infrastructure
Pydantic models for railway stations, junctions, tracks, loop lines, sections,
and rigorous data provenance tracking.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AssetType(str, Enum):
    TRACK = "Track"
    OHE = "OHE"
    SIGNALING = "Signaling"
    TURNOUT = "Turnout"


class SectionStatus(str, Enum):
    AVAILABLE = "Available"
    MAINTENANCE = "Maintenance"
    CONFLICT = "Conflict"
    CRITICAL = "Critical"


class SourceType(str, Enum):
    REAL_OFFICIAL = "REAL_OFFICIAL"
    REAL_PUBLIC = "REAL_PUBLIC"
    SYNTHETIC = "SYNTHETIC"
    SIMULATION = "SIMULATION"


class NodeType(str, Enum):
    STATION = "Station"
    JUNCTION = "Junction"
    YARD = "Yard"
    TERMINAL = "Terminal"
    LOOP_ENTRY = "Loop entry"
    LOOP_EXIT = "Loop exit"
    SIDING_CONNECTION = "Siding connection"
    PLATFORM_CONNECTION = "Platform connection"
    CROSSOVER = "Crossover"
    SECTION_BOUNDARY = "Section boundary"


class TrackType(str, Enum):
    UP_MAIN = "UP Main"
    DOWN_MAIN = "DOWN Main"
    SINGLE_LINE = "Single Line"
    LOOP_LINE = "Loop Line"
    SIDING = "Siding"
    YARD_LINE = "Yard Line"
    ALTERNATE_ROUTE = "Alternate Route"
    CROSSOVER = "Crossover"


class TrackDirection(str, Enum):
    UP = "UP"                     # E.g. TPJ -> MS (Towards Headquarters/Origin)
    DOWN = "DOWN"                 # E.g. MS -> TPJ (Away from Origin)
    BIDIRECTIONAL = "BIDIRECTIONAL"


class DataProvenance(BaseModel):
    """Rigorous audit provenance tracking for every infrastructure entity."""
    source: str = Field(..., description="Entity data source (e.g. OpenRailwayMap, Indian Railways WTT)")
    source_url: str = Field("", description="Authoritative reference URL or publication name")
    source_type: SourceType = SourceType.REAL_PUBLIC
    retrieved_at: str = Field("2026-09-18T00:00:00Z", description="Timestamp when data was recorded")
    verification_status: str = Field("publicly verified", description="publicly verified | operational simulation")


class Siding(BaseModel):
    """A railway siding (goods, cement, depot, or stabling line) connected to the mainline."""
    siding_id: str = Field(..., description="Unique siding ID e.g. SID_ALU_CEMENT")
    station_id: str = Field(..., description="Host station ID")
    station_name: str = Field("")
    purpose: str = Field("Goods Loading", description="Purpose e.g. Cement Loading, Goods Shed, EMU Stabling")
    length_m: int = Field(500, ge=50, description="Clear standing room in meters")
    is_electrified: bool = True
    connected_track_id: str = Field("", description="Connecting track edge ID")
    has_buffer_stop: bool = True
    speed_limit_kmh: int = Field(15, description="Siding maximum permissible speed")
    provenance: Optional[DataProvenance] = None


class RailwayYard(BaseModel):
    """A railway yard (marshalling yard, coaching yard, or loco shed)."""
    yard_id: str = Field(..., description="Unique yard ID e.g. YRD_GOC_WORKSHOP")
    name: str = Field(...)
    station_id: str = Field(...)
    yard_type: str = Field("Marshalling", description="Marshalling | Coaching Depot | Workshop | Goods Yard")
    track_count: int = Field(6, ge=1)
    capacity_rakes: int = Field(8, ge=1)
    is_electrified: bool = True
    provenance: Optional[DataProvenance] = None


class RailwayAsset(BaseModel):
    """A geographically anchored physical railway asset along a section or station."""
    asset_id: str = Field(..., description="Unique asset ID e.g. SIG_VM_01")
    asset_type: str = Field(..., description="Signal | Point Machine | OHE Substation | EI Cabin | Bridge | Track Circuit")
    name: str = Field(...)
    section_id: Optional[str] = None
    station_id: Optional[str] = None
    latitude: float = Field(0.0)
    longitude: float = Field(0.0)
    condition_score: float = Field(1.0, ge=0.0, le=1.0)
    status: str = Field("OPERATIONAL", description="OPERATIONAL | RESTRICTED | MAINTENANCE | DEFECT")
    last_inspected: str = Field("2026-09-01")
    provenance: Optional[DataProvenance] = None


class Platform(BaseModel):
    """A physical passenger platform at a railway station."""
    platform_id: str = Field(..., description="e.g. PF_TPJ_01")
    station_id: str = Field(...)
    platform_number: int = Field(..., ge=1)
    length_m: int = Field(600, ge=100, description="Platform length accommodating 24-coach LHB rakes")
    is_island: bool = False
    track_id: Optional[str] = None
    provenance: Optional[DataProvenance] = None


class Station(BaseModel):
    """A railway station/junction node with verified geographic & schematic coordinates."""
    station_id: str = Field(..., description="Unique station identifier e.g. STN_A or MS")
    name: str = Field(..., description="Station display name")
    code: str = Field("", description="Official Indian Railways Station Code e.g. MS, CGL, VM, TPJ")
    latitude: float = Field(0.0, description="Real WGS84 latitude")
    longitude: float = Field(0.0, description="Real WGS84 longitude")
    x: float = Field(0.0, description="SVG/Schematic x-coordinate for visualization")
    y: float = Field(0.0, description="SVG/Schematic y-coordinate for visualization")
    node_type: NodeType = NodeType.STATION
    platforms: int = Field(2, ge=1, description="Number of passenger platforms")
    platform_count: int = Field(2, ge=1, description="Verified platform count")
    running_tracks: int = Field(2, ge=1, description="Number of main running lines")
    loop_count: int = Field(1, ge=0, description="Number of operational loop lines")
    siding_count: int = Field(0, ge=0, description="Number of connected sidings")
    yard_count: int = Field(0, ge=0, description="Number of associated yards")
    has_common_loop: bool = Field(True, description="Whether station possesses a loop line for overtakes/holds")
    division: str = Field("Southern Railway", description="Railway Zone / Division")
    source: str = Field("Southern Railway WTT & OpenRailwayMap", description="Verified source")
    source_url: str = Field("https://openrailwaymap.org", description="Source link")
    verification_status: str = Field("publicly verified", description="publicly verified | requires verification")
    provenance: Optional[DataProvenance] = None


class TrackEdge(BaseModel):
    """An individual physical track element connecting two nodes."""
    track_id: str = Field(..., description="Unique track identifier e.g. TRK_MS_CGL_UP")
    section_id: str = Field(..., description="Parent section ID e.g. S01")
    from_node: str = Field(..., description="Source node station_id")
    to_node: str = Field(..., description="Destination node station_id")
    track_type: TrackType = TrackType.DOWN_MAIN
    direction: TrackDirection = TrackDirection.DOWN
    length_km: float = Field(..., ge=0)
    capacity_trains_per_hr: float = Field(3.0, ge=0.5)
    speed_limit_kmh: int = Field(110, ge=15)
    is_electrified: bool = Field(True, description="25 kV AC 50 Hz OHE electrification")
    is_available: bool = Field(True)
    status: str = Field("AVAILABLE", description="AVAILABLE | BLOCKED | RESTRICTED")
    current_possession: Optional[str] = Field(None, description="Active possession task ID if any")
    affected_trains: List[str] = Field(default_factory=list)
    source: str = Field("OpenRailwayMap & Southern Railway WTT")
    source_url: str = Field("https://openrailwaymap.org")
    verification_status: str = Field("publicly verified")
    provenance: Optional[DataProvenance] = None


class LoopLine(BaseModel):
    """A loop line or refuge siding available for train regulation or holding."""
    loop_id: str = Field(..., description="e.g. LOOP_VM_01")
    station_id: str = Field(..., description="Host station ID")
    station_name: str = Field("")
    track_type: TrackType = TrackType.LOOP_LINE
    length_m: int = Field(750, ge=100, description="CSR (Clear Standing Room) in meters")
    capacity_trains: int = Field(1, ge=1)
    is_electrified: bool = True
    speed_limit_kmh: int = Field(30, description="Turnout speed limit (typically 30 or 50 km/h in IR)")
    is_occupied: bool = False
    occupying_train_id: Optional[str] = None
    connected_tracks: List[str] = Field(default_factory=lambda: ["UP Main", "DOWN Main"])
    suitable_movements: List[str] = Field(default_factory=lambda: ["Freight Hold", "Passenger Overtake", "SLW Bypass"])
    planner_status: str = Field("AVAILABLE", description="AVAILABLE | BLOCKED | RESERVED | OCCUPIED")
    source: str = Field("Southern Railway Station Working Rules (SWR)")
    source_url: str = Field("https://sr.indianrailways.gov.in")
    verification_status: str = Field("publicly verified")
    provenance: Optional[DataProvenance] = None


class Section(BaseModel):
    """A railway section connecting two stations with multi-track support."""
    section_id: str = Field(..., description="e.g. S01")
    from_station: str
    to_station: str
    length_km: float = Field(..., ge=0)
    capacity: int = Field(2, description="Number of parallel tracks (1=single, 2=double, 4=quad)")
    asset_type: AssetType = AssetType.TRACK
    asset_age_years: float = Field(0, ge=0)
    last_maintenance_date: str = Field("", description="ISO date string")
    days_since_maintenance: int = Field(0, ge=0)
    defect_count: int = Field(0, ge=0)
    condition_score: float = Field(1.0, ge=0, le=1.0, description="1.0=perfect, 0.0=failed")
    risk_score: float = Field(0.0, ge=0, le=1.0)
    status: SectionStatus = SectionStatus.AVAILABLE
    
    # Advanced railway infrastructure fields
    speed_limit_kmh: int = Field(110, ge=15)
    is_electrified: bool = Field(True)
    has_loop_line: bool = Field(True)
    tracks: List[TrackEdge] = Field(default_factory=list)
    division: str = Field("Southern Railway / TPJ Division")
    line_type: str = Field("Double Line FEDL", description="Double Line FEDL | Single Line | Alternate Route")
    provenance: Optional[DataProvenance] = None


class RailwayNetwork(BaseModel):
    """Complete railway network model containing topological graph, geographic nodes, and loop assets."""
    corridor_name: str = "Southern Railway Chennai–Kanniyakumari Grand South Trunk Corridor (742 km)"
    zone: str = "Southern Railway (SR)"
    divisions: List[str] = Field(default_factory=lambda: ["Chennai (MAS)", "Tiruchirappalli (TPJ)", "Madurai (MDU)", "Thiruvananthapuram (TVC)"])
    stations: List[Station]
    sections: List[Section]
    tracks: List[TrackEdge] = Field(default_factory=list)
    loop_lines: List[LoopLine] = Field(default_factory=list)
    sidings: List[Siding] = Field(default_factory=list)
    yards: List[RailwayYard] = Field(default_factory=list)
    assets: List[RailwayAsset] = Field(default_factory=list)
    platforms: List[Platform] = Field(default_factory=list)
    provenance_registry: Dict[str, DataProvenance] = Field(default_factory=dict)
    description: str = "Southern Railway Grand South Trunk Corridor infrastructure grounded in OpenRailwayMap, Survey of India, and Indian Railways public records."
