import structlog
from redis.asyncio import ConnectionPool, Redis

logger = structlog.get_logger(__name__)


class RedisManager:
    def __init__(self) -> None:
        self._pool: ConnectionPool | None = None
        self._client: Redis | None = None

    @property
    def client(self) -> Redis:
        if self._client is None:
            raise RuntimeError("Redis is not connected. Application startup may have failed.")
        return self._client

    async def connect(self, url: str) -> None:
        self._pool = ConnectionPool.from_url(url, decode_responses=True)
        self._client = Redis(connection_pool=self._pool)
        await self._client.ping()
        logger.info("redis_connected", url=url.split("@")[-1])

    async def ping(self) -> bool:
        if self._client is None:
            return False
        try:
            return bool(await self._client.ping())
        except Exception as exc:
            logger.warning("redis_ping_failed", error=str(exc))
            return False

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        if self._pool is not None:
            await self._pool.aclose()
            self._pool = None
        logger.info("redis_disconnected")


redis_manager = RedisManager()
