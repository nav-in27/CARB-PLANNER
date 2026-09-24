"""
CARB-Planner — Database Initialization & Migration Script
Connects to Supabase PostgreSQL, enables PostGIS extension (if available),
creates relational schema tables, and executes idempotent data seeding.
"""

import sys
import logging
from sqlalchemy import text
from backend.database.db import get_engine, get_session_factory, Base, get_database_url
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("carb-planner.init_db")


def init_database() -> bool:
    """Initialize database tables and seed canonical data."""
    db_url = get_database_url()
    if not db_url:
        logger.warning("DATABASE_URL is not set. Skipping PostgreSQL database initialization.")
        return False

    engine = get_engine()
    if engine is None:
        logger.error("Could not obtain database engine.")
        return False

    try:
        logger.info("Attempting to verify/enable PostGIS extension...")
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
                conn.commit()
                logger.info("PostGIS extension enabled/verified.")
            except Exception as e:
                logger.warning(f"Could not enable PostGIS (insufficient privileges or not supported): {e}")

        logger.info("Creating all database tables (if they do not exist)...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables verified.")

        session_factory = get_session_factory()
        if session_factory:
            with session_factory() as session:
                logger.info("Seeding database with canonical CARB-Planner network and timetable data...")
                counts = seed_database(session)
                logger.info(f"Seeding completed: {counts}")

        return True
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        return False


if __name__ == "__main__":
    success = init_database()
    if not success:
        sys.exit(1)
