"""
CARB-Planner — Production Database Connection & Session Management
Supports Supabase PostgreSQL with robust connection pooling and pre-ping checks.
"""

import os
import logging
from typing import Generator, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

logger = logging.getLogger("carb-planner.db")

Base = declarative_base()

_engine = None
_SessionFactory = None


def get_database_url() -> Optional[str]:
    """Retrieve and normalize DATABASE_URL from environment."""
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        return None
    url = raw_url.strip()
    # Supabase gives postgres:// which SQLAlchemy 2.x prefers as postgresql+psycopg2://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def get_engine():
    """Get or create singleton SQLAlchemy engine with Supabase-optimized connection pool."""
    global _engine, _SessionFactory
    if _engine is not None:
        return _engine

    db_url = get_database_url()
    if not db_url:
        return None

    try:
        # Supabase connection pool configuration
        # pool_pre_ping=True avoids Stale Connection errors when Supabase idle timeouts kick in
        _engine = create_engine(
            db_url,
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
            pool_timeout=30,
            pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "1800")),
            pool_pre_ping=True,
            echo=(os.getenv("SQL_ECHO", "false").lower() == "true"),
        )
        _SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
        logger.info("Initialized production database engine with connection pooling.")
        return _engine
    except Exception as e:
        logger.error(f"Failed to initialize database engine: {e}")
        return None


def get_session_factory():
    """Get the SQLAlchemy session factory."""
    global _SessionFactory
    if _SessionFactory is None:
        get_engine()
    return _SessionFactory


def get_db_session() -> Generator[Optional[Session], None, None]:
    """FastAPI dependency for yielding database sessions."""
    factory = get_session_factory()
    if factory is None:
        yield None
        return

    session = factory()
    try:
        yield session
    finally:
        session.close()


def check_db_health() -> dict:
    """Verify live connectivity against Supabase PostgreSQL."""
    db_url = get_database_url()
    if not db_url:
        return {"status": "unconfigured", "connected": False, "message": "DATABASE_URL not set"}

    engine = get_engine()
    if engine is None:
        return {"status": "error", "connected": False, "message": "Engine initialization failed"}

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1;")).scalar()
            # Check PostGIS extension status
            postgis_enabled = False
            try:
                pg_res = conn.execute(text("SELECT PostGIS_Version();")).scalar()
                postgis_enabled = bool(pg_res)
            except Exception:
                postgis_enabled = False

            return {
                "status": "connected",
                "connected": True,
                "ping": result == 1,
                "postgis": postgis_enabled,
            }
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return {"status": "disconnected", "connected": False, "error": str(e)}
