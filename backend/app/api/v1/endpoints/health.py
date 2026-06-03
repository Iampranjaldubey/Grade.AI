from fastapi import APIRouter, Request

from app import __version__
from app.db.session import ping_db
from app.infrastructure.chromadb_client import ChromaDBClient
from app.infrastructure.redis_client import redis_manager
from app.schemas.health import HealthResponse, ServiceStatus

router = APIRouter()


def _service_status(available: bool) -> ServiceStatus:
    return ServiceStatus(status="ok" if available else "unavailable")


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns overall status and connectivity for database, Redis, and ChromaDB.",
)
async def health_check(request: Request) -> HealthResponse:
    db_ok = await ping_db()

    redis_ok = False
    if getattr(request.app.state, "redis_available", False):
        redis_ok = await redis_manager.ping()

    chroma_ok = False
    chroma_client: ChromaDBClient | None = getattr(request.app.state, "chroma_client", None)
    if chroma_client is not None:
        chroma_ok = await chroma_client.ping()

    checks = [db_ok, redis_ok, chroma_ok]
    if all(checks):
        overall = "ok"
    elif any(checks):
        overall = "degraded"
    else:
        overall = "unavailable"

    return HealthResponse(
        status=overall,
        version=__version__,
        db=_service_status(db_ok),
        redis=_service_status(redis_ok),
        chromadb=_service_status(chroma_ok),
    )
