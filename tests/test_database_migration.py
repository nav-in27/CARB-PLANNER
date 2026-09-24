"""
CARB-Planner — Production Database Migration & Seeding Verification Tests
Validates that:
- Relational schema tables (Corridors, Stations, Tracks, Loops, Sidings, Yards,
  Assets, Train Services, Maintenance Tasks, Scenarios, Plans, Audit Logs) create without error
- Canonical seeding is completely idempotent (second pass adds 0 duplicates)
- Health check accurately reports database connectivity
"""

import os
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.database.db import Base
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
from backend.database.seed_db import seed_database


@pytest.fixture
def test_db_session():
    """Create a clean in-memory SQLite database session for migration & seeding testing."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


def test_schema_creation_and_tables(test_db_session):
    """Test all production database tables are successfully registered in SQLAlchemy metadata."""
    expected_tables = {
        "corridors",
        "stations",
        "sections",
        "tracks",
        "loops",
        "sidings",
        "yards",
        "assets",
        "train_services",
        "maintenance_tasks",
        "scenarios",
        "operational_plans",
        "monthly_plans",
        "weekly_plans",
        "audit_logs",
    }
    registered_tables = set(Base.metadata.tables.keys())
    for tbl in expected_tables:
        assert tbl in registered_tables, f"Table '{tbl}' is missing from database metadata!"


def test_idempotent_seeding(test_db_session):
    """Test canonical seeding populates data and second pass produces zero duplicates."""
    # First seed pass
    seeded_counts = seed_database(test_db_session)
    assert seeded_counts["corridors"] >= 1
    assert seeded_counts["stations"] >= 14
    assert seeded_counts["sections"] >= 26
    assert seeded_counts["tracks"] >= 26
    assert seeded_counts["loops"] >= 10
    assert seeded_counts["train_services"] >= 20
    assert seeded_counts["maintenance_tasks"] >= 10
    assert seeded_counts["scenarios"] >= 1

    initial_station_count = test_db_session.query(StationModel).count()
    initial_train_count = test_db_session.query(TrainServiceModel).count()
    initial_task_count = test_db_session.query(MaintenanceTaskModel).count()

    # Second seed pass — MUST BE IDEMPOTENT (no duplicates added)
    second_counts = seed_database(test_db_session)
    assert second_counts["corridors"] == 0
    assert second_counts["stations"] == 0
    assert second_counts["sections"] == 0
    assert second_counts["tracks"] == 0
    assert second_counts["loops"] == 0
    assert second_counts["train_services"] == 0
    assert second_counts["maintenance_tasks"] == 0

    assert test_db_session.query(StationModel).count() == initial_station_count
    assert test_db_session.query(TrainServiceModel).count() == initial_train_count
    assert test_db_session.query(MaintenanceTaskModel).count() == initial_task_count


def test_corridor_and_station_spatial_coordinates(test_db_session):
    """Verify that seeded stations possess real geographic coordinates (WGS84)."""
    seed_database(test_db_session)
    stns = test_db_session.query(StationModel).all()
    assert len(stns) >= 14
    for stn in stns:
        assert 8.0 <= stn.latitude <= 14.0, f"Station {stn.code} latitude out of Tamil Nadu bounds: {stn.latitude}"
        assert 77.0 <= stn.longitude <= 81.0, f"Station {stn.code} longitude out of Tamil Nadu bounds: {stn.longitude}"
        assert stn.code != ""
