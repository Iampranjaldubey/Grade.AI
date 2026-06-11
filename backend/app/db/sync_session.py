"""
Synchronous SQLAlchemy session for Celery tasks.
Celery tasks cannot use async database operations.
"""
from contextlib import contextmanager
from typing import Generator

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = structlog.get_logger(__name__)

_sync_engine = None
_SyncSessionLocal = None


def get_sync_engine():
    """Get or create synchronous SQLAlchemy engine."""
    global _sync_engine
    if _sync_engine is None:
        settings = get_settings()
        # Use synchronous database URL (psycopg2, not asyncpg)
        _sync_engine = create_engine(
            settings.database_url_sync,
            echo=settings.debug,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        logger.info("sync_database_engine_created")
    return _sync_engine


def get_sync_session_factory():
    """Get or create synchronous session factory."""
    global _SyncSessionLocal
    if _SyncSessionLocal is None:
        engine = get_sync_engine()
        _SyncSessionLocal = sessionmaker(
            bind=engine,
            class_=Session,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        logger.info("sync_session_factory_created")
    return _SyncSessionLocal


@contextmanager
def get_sync_db() -> Generator[Session, None, None]:
    """
    Context manager for synchronous database sessions.
    Used in Celery tasks.
    
    Usage:
        with get_sync_db() as db:
            document = db.query(Document).filter_by(id=doc_id).first()
            document.parse_status = ParseStatus.SUCCESS
            db.commit()
    """
    SessionLocal = get_sync_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ping_sync_db() -> bool:
    """Test synchronous database connection."""
    try:
        engine = get_sync_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("sync_database_ping_failed", error=str(exc))
        return False
