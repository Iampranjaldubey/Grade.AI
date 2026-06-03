import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger(__name__)


class ChromaDBClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.chromadb_url
        self._http: httpx.AsyncClient | None = None

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self._base_url, timeout=10.0)
        return self._http

    async def ping(self) -> bool:
        try:
            response = await self.http.get("/api/v1/heartbeat")
            return response.status_code == 200
        except httpx.HTTPError as exc:
            logger.warning("chromadb_ping_failed", error=str(exc))
            return False

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None
        logger.info("chromadb_disconnected")
