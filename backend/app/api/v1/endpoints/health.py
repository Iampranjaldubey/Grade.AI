from fastapi import APIRouter, Request, Response, status

from app import __version__
from app.db.session import ping_db
from app.infrastructure.chromadb_client import ChromaDBClient
from app.infrastructure.redis_client import redis_manager
from app.schemas.health import HealthResponse, LivenessResponse, ServiceStatus

router = APIRouter()


def _service_status(available: bool) -> ServiceStatus:
    return ServiceStatus(status="ok" if available else "unavailable")


def resolve_health(db_ok: bool, redis_ok: bool, chroma_ok: bool) -> tuple[str, int]:
    """
    Map dependency availability to an overall status and HTTP status code.

    The database and Redis are both required to serve authenticated traffic:
    Redis holds the refresh-token allowlist and the access-token blacklist, so
    without it auth decisions can't be trusted. ChromaDB only backs RAG
    retrieval, so losing it degrades grading quality rather than taking the API
    down — which matches how the startup lifespan already tolerates it.

    Returns ``(overall_status, http_status_code)``.
    """
    if not (db_ok and redis_ok):
        return "unavailable", status.HTTP_503_SERVICE_UNAVAILABLE
    if not chroma_ok:
        return "degraded", status.HTTP_200_OK
    return "ok", status.HTTP_200_OK


@router.get(
    "/health/live",
    response_model=LivenessResponse,
    summary="Liveness probe",
    description=(
        "Confirms the process is running and able to serve requests. Checks no "
        "dependencies, so a transient database or Redis blip cannot trigger a "
        "container restart loop. Use this for container/liveness probes."
    ),
)
async def liveness() -> LivenessResponse:
    return LivenessResponse(status="ok", version=__version__)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Readiness / health check",
    description=(
        "Reports connectivity for the database, Redis, and ChromaDB. Returns 503 "
        "when a dependency required to serve traffic is unavailable, so load "
        "balancer and orchestrator probes can act on it. Use this for readiness "
        "and target-group health checks."
    ),
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "A required dependency is unavailable",
            "model": HealthResponse,
        }
    },
)
async def health_check(request: Request, response: Response) -> HealthResponse:
    db_ok = await ping_db()

    redis_ok = False
    if getattr(request.app.state, "redis_available", False):
        redis_ok = await redis_manager.ping()

    chroma_ok = False
    chroma_client: ChromaDBClient | None = getattr(request.app.state, "chroma_client", None)
    if chroma_client is not None:
        chroma_ok = await chroma_client.ping()

    # Signal failure in the status line, not just the body. This endpoint used
    # to always return 200, so a probe could never fail and a broken container
    # would stay in service indefinitely.
    overall, status_code = resolve_health(db_ok, redis_ok, chroma_ok)
    response.status_code = status_code

    return HealthResponse(
        status=overall,
        version=__version__,
        db=_service_status(db_ok),
        redis=_service_status(redis_ok),
        chromadb=_service_status(chroma_ok),
    )
