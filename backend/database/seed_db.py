"""
CARB-Planner — Production Database Seeder
Seeds Supabase PostgreSQL with canonical Southern Railway Grand South Trunk
corridor topology, real Tamil Nadu stations, tracks, loops, train services,
multi-horizon maintenance tasks, scenarios, and initial plans.
Idempotent: Only seeds missing records; never overwrites or duplicates existing data.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.data.corridor_catalog import get_primary_corridor, CORRIDOR_REGISTRY
from backend.data.generator import generate_demo_scenario
from backend.data.timetable import build_corridor_timetable
from backend.models.horizon_plans import derive_horizon_calendar
from backend.database.models import (
    CorridorModel,
    StationModel,
    SectionModel,
    TrackModel,
    LoopModel,
    SidingModel,
    YardModel,
    RailwayAssetModel,
    TrainServiceModel,
    MaintenanceTaskModel,
    ScenarioModel,
    OperationalPlanModel,
    MonthlyPlanModel,
    WeeklyPlanModel,
    AuditLogModel,
)

logger = logging.getLogger("carb-planner.seed")


def seed_database(session: Session) -> dict:
    """Idempotently seed the Supabase database with all canonical CARB-Planner entities."""
    seeded_counts = {
        "corridors": 0,
        "stations": 0,
        "sections": 0,
        "tracks": 0,
        "loops": 0,
        "sidings": 0,
        "yards": 0,
        "assets": 0,
        "train_services": 0,
        "maintenance_tasks": 0,
        "scenarios": 0,
        "plans": 0,
    }

    try:
        # 1. Seed Corridors
        for corridor in CORRIDOR_REGISTRY:
            existing = session.query(CorridorModel).filter_by(corridor_id=corridor.corridor_id).first()
            if not existing:
                c_model = CorridorModel(
                    corridor_id=corridor.corridor_id,
                    name=corridor.name,
                    short_name=corridor.short_name,
                    origin=corridor.origin,
                    origin_code=corridor.origin_code,
                    destination=corridor.destination,
                    destination_code=corridor.destination_code,
                    total_distance_km=corridor.total_distance_km,
                    zone=corridor.zone,
                    divisions=corridor.divisions,
                    electrification=corridor.electrification,
                    gauge=corridor.gauge,
                    state=corridor.state,
                    source=corridor.source,
                    source_url=corridor.source_url,
                    data_version=corridor.data_version,
                    verification_status=corridor.verification_status,
                )
                session.add(c_model)
                seeded_counts["corridors"] += 1

        session.flush()

        # 2. Generate canonical network, tasks, and trains
        scenario = generate_demo_scenario(seed=42)
        network = scenario["network"]
        tasks = scenario["tasks"]
        trains = scenario["trains"]

        # 3. Seed Stations
        for stn in network.stations:
            existing = session.query(StationModel).filter_by(station_id=stn.station_id).first()
            if not existing:
                s_model = StationModel(
                    station_id=stn.station_id,
                    name=stn.name,
                    code=stn.code or stn.station_id,
                    latitude=stn.latitude,
                    longitude=stn.longitude,
                    node_type=stn.node_type.value if hasattr(stn.node_type, "value") else str(stn.node_type),
                    platforms=stn.platforms,
                    platform_count=stn.platform_count,
                    running_tracks=stn.running_tracks,
                    loop_count=stn.loop_count,
                    siding_count=stn.siding_count,
                    yard_count=stn.yard_count,
                    has_common_loop=stn.has_common_loop,
                    division=stn.division,
                    source=stn.source,
                    source_url=stn.source_url,
                    verification_status=stn.verification_status,
                    provenance=stn.provenance.model_dump() if stn.provenance else None,
                )
                session.add(s_model)
                seeded_counts["stations"] += 1

        session.flush()

        # 4. Seed Sections
        for sec in network.sections:
            existing = session.query(SectionModel).filter_by(section_id=sec.section_id).first()
            if not existing:
                sec_model = SectionModel(
                    section_id=sec.section_id,
                    from_station=sec.from_station,
                    to_station=sec.to_station,
                    length_km=sec.length_km,
                    capacity=sec.capacity,
                    line_type=sec.line_type,
                    division=sec.division,
                    speed_limit_kmh=sec.speed_limit_kmh,
                    is_electrified=sec.is_electrified,
                    has_loop_line=sec.has_loop_line,
                    condition_score=sec.condition_score,
                    risk_score=sec.risk_score,
                    status=sec.status.value if hasattr(sec.status, "value") else str(sec.status),
                    provenance=sec.provenance.model_dump() if sec.provenance else None,
                )
                session.add(sec_model)
                seeded_counts["sections"] += 1

        session.flush()

        # 5. Seed Tracks
        for trk in network.tracks:
            existing = session.query(TrackModel).filter_by(track_id=trk.track_id).first()
            if not existing:
                trk_model = TrackModel(
                    track_id=trk.track_id,
                    section_id=trk.section_id,
                    from_node=trk.from_node,
                    to_node=trk.to_node,
                    track_type=trk.track_type.value if hasattr(trk.track_type, "value") else str(trk.track_type),
                    direction=trk.direction.value if hasattr(trk.direction, "value") else str(trk.direction),
                    length_km=trk.length_km,
                    speed_limit_kmh=trk.speed_limit_kmh,
                    is_electrified=trk.is_electrified,
                    is_available=trk.is_available,
                    status=trk.status,
                    provenance=trk.provenance.model_dump() if trk.provenance else None,
                )
                session.add(trk_model)
                seeded_counts["tracks"] += 1

        session.flush()

        # 6. Seed Loops
        for loop in network.loop_lines:
            existing = session.query(LoopModel).filter_by(loop_id=loop.loop_id).first()
            if not existing:
                loop_model = LoopModel(
                    loop_id=loop.loop_id,
                    station_id=loop.station_id,
                    station_name=loop.station_name,
                    station_code=loop.station_code,
                    loop_name=loop.loop_name,
                    track_type=loop.track_type.value if hasattr(loop.track_type, "value") else str(loop.track_type),
                    length_m=loop.length_m,
                    csr_length_m=loop.csr_length_m,
                    capacity_trains=loop.capacity_trains,
                    is_electrified=loop.is_electrified,
                    speed_limit_kmh=loop.speed_limit_kmh,
                    is_occupied=loop.is_occupied,
                    occupying_train_id=loop.occupying_train_id,
                    planner_status=loop.planner_status,
                    provenance=loop.provenance.model_dump() if loop.provenance else None,
                )
                session.add(loop_model)
                seeded_counts["loops"] += 1

        session.flush()

        # 7. Seed Sidings
        for sid in network.sidings:
            existing = session.query(SidingModel).filter_by(siding_id=sid.siding_id).first()
            if not existing:
                sid_model = SidingModel(
                    siding_id=sid.siding_id,
                    station_id=sid.station_id,
                    station_name=sid.station_name,
                    purpose=sid.purpose,
                    length_m=sid.length_m,
                    is_electrified=sid.is_electrified,
                    speed_limit_kmh=sid.speed_limit_kmh,
                    provenance=sid.provenance.model_dump() if sid.provenance else None,
                )
                session.add(sid_model)
                seeded_counts["sidings"] += 1

        session.flush()

        # 8. Seed Yards
        for yrd in network.yards:
            existing = session.query(YardModel).filter_by(yard_id=yrd.yard_id).first()
            if not existing:
                yrd_model = YardModel(
                    yard_id=yrd.yard_id,
                    station_id=yrd.station_id,
                    name=yrd.name,
                    yard_type=yrd.yard_type,
                    track_count=yrd.track_count,
                    capacity_rakes=yrd.capacity_rakes,
                    is_electrified=yrd.is_electrified,
                    provenance=yrd.provenance.model_dump() if yrd.provenance else None,
                )
                session.add(yrd_model)
                seeded_counts["yards"] += 1

        session.flush()

        # 9. Seed Assets
        for ast in network.assets:
            existing = session.query(RailwayAssetModel).filter_by(asset_id=ast.asset_id).first()
            if not existing:
                ast_model = RailwayAssetModel(
                    asset_id=ast.asset_id,
                    asset_type=ast.asset_type,
                    name=ast.name,
                    section_id=ast.section_id,
                    station_id=ast.station_id,
                    latitude=ast.latitude,
                    longitude=ast.longitude,
                    condition_score=ast.condition_score,
                    status=ast.status,
                    last_inspected=ast.last_inspected,
                    provenance=ast.provenance.model_dump() if ast.provenance else None,
                )
                session.add(ast_model)
                seeded_counts["assets"] += 1

        session.flush()

        # 10. Seed Train Services from Timetable
        timetable = build_corridor_timetable()
        for svc in timetable.services:
            existing = session.query(TrainServiceModel).filter_by(train_number=svc.train_number).first()
            if not existing:
                cat_str = svc.category.value if hasattr(svc.category, "value") else str(svc.category)
                dep_time = ""
                arr_time = ""
                if svc.movements:
                    dep_time = getattr(svc.movements[0], "departure_time_str", "") or ""
                    arr_time = getattr(svc.movements[-1], "arrival_time_str", "") or ""

                svc_model = TrainServiceModel(
                    train_number=svc.train_number,
                    train_name=svc.train_name,
                    train_type=cat_str,
                    priority=str(svc.priority_class.value if hasattr(svc.priority_class, "value") else (svc.priority_class or "P1")),
                    origin=svc.source_station,
                    destination=svc.destination_station,
                    departure_time=dep_time,
                    arrival_time=arr_time,
                    rake_type="LHB" if "Vande" not in svc.train_name else "Vande Bharat Express",
                    max_speed_kmh=130 if "Vande" in svc.train_name else 110,
                    movements=[m.model_dump() for m in svc.movements],
                    provenance={
                        "source": getattr(svc, "source", "Southern Railway WTT"),
                        "source_url": getattr(svc, "source_url", ""),
                        "data_version": getattr(svc, "data_version", "2026-V1"),
                        "data_mode": str(getattr(svc, "data_mode", "PUBLIC_TIMETABLE")),
                    },
                )
                session.add(svc_model)
                seeded_counts["train_services"] += 1

        session.flush()

        # 11. Seed Maintenance Tasks with Multi-Horizon Linkages
        for task in tasks:
            existing = session.query(MaintenanceTaskModel).filter_by(task_id=task.task_id).first()
            if not existing:
                t_model = MaintenanceTaskModel(
                    task_id=task.task_id,
                    department=task.department.value if hasattr(task.department, "value") else str(task.department),
                    task_type=task.task_type.value if hasattr(task.task_type, "value") else str(task.task_type),
                    section_id=task.section_id,
                    priority=task.priority.value if hasattr(task.priority, "value") else str(task.priority),
                    criticality=task.criticality.value if hasattr(task.criticality, "value") else str(task.criticality),
                    asset_age=task.asset_age,
                    condition_score=task.condition_score,
                    crew_size=task.crew_size,
                    crew_available=task.crew_available,
                    complexity=task.complexity,
                    weather_factor=task.weather_factor,
                    historical_duration_min=task.historical_duration_min,
                    predicted_p50_min=task.predicted_p50_min,
                    predicted_p90_min=task.predicted_p90_min,
                    earliest_start_slot=task.earliest_start_slot,
                    deadline_slot=task.deadline_slot,
                    risk_score=task.risk_score,
                    risk_level=task.risk_level.value if hasattr(task.risk_level, "value") else str(task.risk_level),
                    status=task.status.value if hasattr(task.status, "value") else str(task.status),
                    is_deferrable=task.is_deferrable,
                    allocated_start_slot=task.allocated_start_slot,
                    allocated_end_slot=task.allocated_end_slot,
                    explanation=task.explanation,
                    decision_context=task.decision_context,
                    monthly_plan_id=task.monthly_plan_id or "M-2026-09-v1",
                    preferred_week=task.preferred_week or 3,
                    monthly_status=task.monthly_status or "APPROVED",
                    weekly_plan_id=task.weekly_plan_id or "W-2026-09-W3-v1",
                    planned_day=task.planned_day or "Friday",
                    weekly_window=getattr(task, "planned_window", None),
                )
                session.add(t_model)
                seeded_counts["maintenance_tasks"] += 1

        session.flush()

        # 12. Seed Canonical Planning Scenario
        scenario_id = "SCENARIO_CANONICAL_01"
        existing_scenario = session.query(ScenarioModel).filter_by(scenario_id=scenario_id).first()
        if not existing_scenario:
            sc_model = ScenarioModel(
                scenario_id=scenario_id,
                corridor_id="SR_GST_01",
                planning_date="2026-09-18",
                timetable_version="SR-WTT-2026-V1",
                network_version="SR-GIS-TN-V2",
                system_mode="PUBLIC_TIMETABLE",
                approval_status="Feasible",
                selected_direction="BOTH",
                selected_sections=["S01", "S02", "S03", "S04", "S05", "S06"],
            )
            session.add(sc_model)
            seeded_counts["scenarios"] += 1

        # 13. Seed Multi-Horizon Plans
        existing_month = session.query(MonthlyPlanModel).filter_by(plan_id="M-2026-09-v1").first()
        if not existing_month:
            m_plan = MonthlyPlanModel(
                plan_id="M-2026-09-v1",
                month="2026-09",
                year=2026,
                status="APPROVED",
                target_block_hours=120.0,
                kpis={
                    "total_tasks": len(tasks),
                    "total_hours": sum(t.historical_duration_min for t in tasks) / 60.0,
                    "critical_tasks": sum(1 for t in tasks if str(t.priority).lower() in ["high", "critical"]),
                },
            )
            session.add(m_plan)
            seeded_counts["plans"] += 1

        existing_week = session.query(WeeklyPlanModel).filter_by(plan_id="W-2026-09-W3-v1").first()
        if not existing_week:
            w_plan = WeeklyPlanModel(
                plan_id="W-2026-09-W3-v1",
                month="2026-09",
                week_number=3,
                status="APPROVED",
                target_block_hours=32.0,
                kpis={
                    "total_tasks": len(tasks),
                    "committed_hours": sum(t.historical_duration_min for t in tasks) / 60.0,
                    "target_hours": 32.0,
                },
            )
            session.add(w_plan)
            seeded_counts["plans"] += 1

        # 14. Initial Audit Log
        existing_audit = session.query(AuditLogModel).filter_by(entry_id="AUD_INITIAL_SEED").first()
        if not existing_audit:
            audit = AuditLogModel(
                entry_id="AUD_INITIAL_SEED",
                timestamp="2026-09-18T00:00:00Z",
                action="INITIAL_DATABASE_SEED",
                actor="system",
                version_number=1,
                details={"status": "Production database initialized with canonical Southern Railway GST data"},
                rationale="System bootstrap and single-source-of-truth initialization",
            )
            session.add(audit)

        session.commit()
        logger.info(f"Database seeding completed successfully: {seeded_counts}")
        return seeded_counts

    except Exception as e:
        session.rollback()
        logger.error(f"Error seeding database: {e}")
        raise e
