"""
Fixed-window rate limiting backed by Redis.

Implemented against the Redis client the app already depends on, mirroring the
login-lockout counter in the auth endpoints, rather than pulling in a dedicated
rate-limiting dependency. Redis is already required in production
(``Settings.validate_required``), so this adds no new infrastructure.

Note this is per-process-agnostic but *not* strictly atomic across the INCR and
EXPIRE pair; a client can in the worst case get one extra request in a window.
That is an acceptable trade for abuse protection.
"""

import structlog
from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from app.core.deps import get_redis

logger = structlog.get_logger(__name__)


def _client_key(request: Request) -> str:
    """
    Best-effort client identity.

    Honours X-Forwarded-For because the app runs behind nginx/an ALB, where
    ``request.client.host`` would otherwise be the proxy for every caller.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Left-most entry is the original client.
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """
    Dependency factory: allow at most ``limit`` requests per ``window_seconds``
    per client, per named bucket.

    Usage:
        _: None = Depends(RateLimiter("register", limit=5, window_seconds=3600))
    """

    def __init__(self, bucket: str, *, limit: int, window_seconds: int) -> None:
        self.bucket = bucket
        self.limit = limit
        self.window_seconds = window_seconds

    async def __call__(
        self,
        request: Request,
        redis: Redis = Depends(get_redis),
    ) -> None:
        client = _client_key(request)
        key = f"ratelimit:{self.bucket}:{client}"

        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, self.window_seconds)
        except Exception as exc:  # pragma: no cover - defensive
            # Fail open: a Redis blip should not take down registration or
            # uploads. The failure is logged so it is still visible.
            logger.warning("rate_limit_unavailable", bucket=self.bucket, error=str(exc))
            return

        if count > self.limit:
            logger.warning(
                "rate_limit_exceeded",
                bucket=self.bucket,
                client=client,
                limit=self.limit,
                window_seconds=self.window_seconds,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait and try again.",
                headers={"Retry-After": str(self.window_seconds)},
            )
