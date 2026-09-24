"""
CARB-Planner — Production SQLAlchemy Database Models for Supabase PostgreSQL
Encapsulates real railway topology, rolling stock timetable, multi-horizon plans,
disruption records, and immutable audit logs.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    JSON,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from backend.database.db import Base


class CorridorModel(Base):
    __tablename__ = "corridors"

    corridor_id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    short_name = Column(String(64), nullable=False)
    origin = Column(String(128), nullable=False)
    origin_code = Column(String(16), nullable=False)
    destination = Column(String(128), nullable=False)
    destination_code = Column(String(16), nullable=False)
    total_distance_km = Column(Float, nullable=False)
    zone = Column(String(64), default="Southern Railway (SR)")
    divisions = Column(JSON, default=list)
    electrification = Column(String(128))
    gauge = Column(String(64), default="Broad Gauge 1676 mm")
    state = Column(String(64), default="Tamil Nadu")
    source = Column(String(255))
    source_url = Column(String(255))
    data_version = Column(String(64))
    verification_status = Column(String(64), default="publicly verified")
    created_at = Column(DateTime, default=datetime.utcnow)


class StationModel(Base):
    __tablename__ = "stations"

    station_id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    code = Column(String(16), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    node_type = Column(String(32), default="Station")
    platforms = Column(Integer, default=2)
    platform_count = Column(Integer, default=2)
    running_tracks = Column(Integer, default=2)
    loop_count = Column(Integer, default=1)
    siding_count = Column(Integer, default=0)
    yard_count = Column(Integer, default=0)
    has_common_loop = Column(Boolean, default=True)
    division = Column(String(64), default="Southern Railway")
    source = Column(String(255))
    source_url = Column(String(255))
    verification_status = Column(String(64), default="publicly verified")
    provenance = Column(JSON, nullable=True)

    __table_args__ = (
        Index("idx_stations_lat_lon", "latitude", "longitude"),
    )


class SectionModel(Base):
    __tablename__ = "sections"

    section_id = Column(String(64), primary_key=True)
    from_station = Column(String(64), nullable=False, index=True)
    to_station = Column(String(64), nullable=False, index=True)
    length_km = Column(Float, nullable=False)
    capacity = Column(Integer, default=2)
    line_type = Column(String(64), default="Double Line FEDL")
    division = Column(String(64), default="Southern Railway")
    speed_limit_kmh = Column(Integer, default=110)
    is_electrified = Column(Boolean, default=True)
    has_loop_line = Column(Boolean, default=True)
    condition_score = Column(Float, default=1.0)
    risk_score = Column(Float, default=0.0)
    status = Column(String(32), default="Available")
    provenance = Column(JSON, nullable=True)


class TrackModel(Base):
    __tablename__ = "tracks"

    track_id = Column(String(64), primary_key=True)
    section_id = Column(String(64), nullable=False, index=True)
    from_node = Column(String(64), nullable=False)
    to_node = Column(String(64), nullable=False)
    track_type = Column(String(32), default="DOWN Main")
    direction = Column(String(16), default="DOWN")
    length_km = Column(Float, nullable=False)
    speed_limit_kmh = Column(Integer, default=110)
    is_electrified = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True)
    status = Column(String(32), default="AVAILABLE")
    provenance = Column(JSON, nullable=True)


class LoopModel(Base):
    __tablename__ = "loops"

    loop_id = Column(String(64), primary_key=True)
    station_id = Column(String(64), nullable=False, index=True)
    station_name = Column(String(128))
    station_code = Column(String(16), index=True)
    loop_name = Column(String(128))
    track_type = Column(String(32), default="Loop Line")
    length_m = Column(Integer, default=750)
    csr_length_m = Column(Integer, default=750)
    capacity_trains = Column(Integer, default=1)
    is_electrified = Column(Boolean, default=True)
    speed_limit_kmh = Column(Integer, default=30)
    is_occupied = Column(Boolean, default=False)
    occupying_train_id = Column(String(64), nullable=True)
    planner_status = Column(String(32), default="AVAILABLE")
    provenance = Column(JSON, nullable=True)


class SidingModel(Base):
    __tablename__ = "sidings"

    siding_id = Column(String(64), primary_key=True)
    station_id = Column(String(64), nullable=False, index=True)
    station_name = Column(String(128))
    purpose = Column(String(128), default="Goods Loading")
    length_m = Column(Integer, default=500)
    is_electrified = Column(Boolean, default=True)
    speed_limit_kmh = Column(Integer, default=15)
    provenance = Column(JSON, nullable=True)


class YardModel(Base):
    __tablename__ = "yards"

    yard_id = Column(String(64), primary_key=True)
    station_id = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    yard_type = Column(String(64), default="Marshalling")
    track_count = Column(Integer, default=6)
    capacity_rakes = Column(Integer, default=8)
    is_electrified = Column(Boolean, default=True)
    provenance = Column(JSON, nullable=True)


class RailwayAssetModel(Base):
    __tablename__ = "assets"

    asset_id = Column(String(64), primary_key=True)
    asset_type = Column(String(64), nullable=False)
    name = Column(String(128), nullable=False)
    section_id = Column(String(64), nullable=True, index=True)
    station_id = Column(String(64), nullable=True, index=True)
    latitude = Column(Float, default=0.0)
    longitude = Column(Float, default=0.0)
    condition_score = Column(Float, default=1.0)
    status = Column(String(32), default="OPERATIONAL")
    last_inspected = Column(String(32), default="2026-09-01")
    provenance = Column(JSON, nullable=True)


class TrainServiceModel(Base):
    __tablename__ = "train_services"

    train_number = Column(String(32), primary_key=True)
    train_name = Column(String(128), nullable=False)
    train_type = Column(String(64), nullable=False)
    priority = Column(Integer, default=1)
    origin = Column(String(64), nullable=False)
    destination = Column(String(64), nullable=False)
    departure_time = Column(String(16))
    arrival_time = Column(String(16))
    rake_type = Column(String(64), default="LHB")
    max_speed_kmh = Column(Integer, default=110)
    movements = Column(JSON, default=list)
    provenance = Column(JSON, nullable=True)


class MaintenanceTaskModel(Base):
    __tablename__ = "maintenance_tasks"

    task_id = Column(String(64), primary_key=True)
    department = Column(String(64), nullable=False, index=True)
    task_type = Column(String(64), nullable=False)
    section_id = Column(String(64), nullable=False, index=True)
    priority = Column(String(32), default="Medium")
    criticality = Column(String(32), default="Medium")
    asset_age = Column(Float, default=0.0)
    condition_score = Column(Float, default=1.0)
    crew_size = Column(Integer, default=5)
    crew_available = Column(Boolean, default=True)
    complexity = Column(Float, default=0.5)
    weather_factor = Column(Float, default=1.0)
    historical_duration_min = Column(Integer, default=120)
    predicted_p50_min = Column(Integer, nullable=True)
    predicted_p90_min = Column(Integer, nullable=True)
    earliest_start_slot = Column(Integer, default=0)
    deadline_slot = Column(Integer, default=96)
    risk_score = Column(Float, default=0.0)
    risk_level = Column(String(32), default="LOW")
    status = Column(String(32), default="Pending")
    is_deferrable = Column(Boolean, default=True)
    allocated_start_slot = Column(Integer, nullable=True)
    allocated_end_slot = Column(Integer, nullable=True)
    explanation = Column(Text, nullable=True)
    decision_context = Column(JSON, nullable=True)

    # Multi-horizon planning linkages
    monthly_plan_id = Column(String(64), nullable=True, index=True)
    preferred_week = Column(Integer, nullable=True)
    monthly_status = Column(String(32), default="PROPOSED")
    weekly_plan_id = Column(String(64), nullable=True, index=True)
    planned_day = Column(String(32), nullable=True)
    weekly_window = Column(String(64), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScenarioModel(Base):
    __tablename__ = "scenarios"

    scenario_id = Column(String(64), primary_key=True)
    corridor_id = Column(String(64), nullable=False, default="SR_GST_01")
    planning_date = Column(String(32), default="2026-09-18")
    timetable_version = Column(String(64), default="SR-WTT-2026-V1")
    network_version = Column(String(64), default="SR-GIS-TN-V2")
    system_mode = Column(String(32), default="PUBLIC_TIMETABLE")
    approval_status = Column(String(32), default="Feasible")
    selected_direction = Column(String(16), default="BOTH")
    selected_sections = Column(JSON, default=list)
    active_plan_id = Column(String(64), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OperationalPlanModel(Base):
    __tablename__ = "operational_plans"

    plan_id = Column(String(64), primary_key=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, index=True)
    is_feasible = Column(Boolean, default=True)
    allocations = Column(JSON, default=list)
    train_assignments = Column(JSON, default=list)
    loop_assignments = Column(JSON, default=list)
    conflicts = Column(JSON, default=list)
    kpis = Column(JSON, default=dict)
    reason = Column(String(255), default="Plan update")
    trigger = Column(String(64), default="PLAN_GENERATE")
    diff_summary = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class MonthlyPlanModel(Base):
    __tablename__ = "monthly_plans"

    plan_id = Column(String(64), primary_key=True)
    month = Column(String(32), default="2026-09")
    year = Column(Integer, default=2026)
    status = Column(String(32), default="APPROVED")
    target_block_hours = Column(Float, default=120.0)
    tasks = Column(JSON, default=list)
    kpis = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class WeeklyPlanModel(Base):
    __tablename__ = "weekly_plans"

    plan_id = Column(String(64), primary_key=True)
    month = Column(String(32), default="2026-09")
    week_number = Column(Integer, default=3)
    status = Column(String(32), default="APPROVED")
    target_block_hours = Column(Float, default=32.0)
    tasks = Column(JSON, default=list)
    kpis = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    entry_id = Column(String(64), primary_key=True)
    timestamp = Column(String(64), nullable=False)
    action = Column(String(64), nullable=False)
    actor = Column(String(128), default="system")
    version_before = Column(Integer, nullable=True)
    version_after = Column(Integer, nullable=True)
    version_number = Column(Integer, nullable=True)
    details = Column(JSON, default=dict)
    rationale = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
