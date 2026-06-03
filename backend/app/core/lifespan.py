from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import close_db_pool, init_db_pool
from app.infrastructure.chromadb_client import ChromaDBClient
from app.infrastructure.redis_client import redis_manager

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)

    chroma_client = ChromaDBClient(settings)

    if settings.is_test:
        app.state.settings = settings
        app.state.chroma_client = chroma_client
        app.state.redis_available = False
        app.state.chroma_available = False
        yield
        return

    logger.info("application_starting", environment=settings.app_env.value)

    await init_db_pool(settings)
    await redis_manager.connect(settings.redis_url)

    chroma_ok = await chroma_client.ping()
    if not chroma_ok:
        logger.warning("chromadb_startup_degraded")

    app.state.settings = settings
    app.state.chroma_client = chroma_client
    app.state.redis_available = True
    app.state.chroma_available = chroma_ok

    logger.info(
        "application_started",
        redis=True,
        chromadb=chroma_ok,
    )

    yield

    logger.info("application_shutting_down")
    await chroma_client.close()
    await redis_manager.close()
    await close_db_pool()
    logger.info("application_stopped")
