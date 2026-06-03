import time
import uuid
from collections.abc import Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings
from app.core.logging import bind_request_context

logger = structlog.get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Callable, settings: Settings) -> None:
        super().__init__(app)
        self._header = settings.request_id_header

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming_id = request.headers.get(self._header)
        request_id = incoming_id if incoming_id else str(uuid.uuid4())
        request.state.request_id = request_id

        user_id = getattr(request.state, "user_id", None)
        bind_request_context(request_id=request_id, user_id=user_id)

        response = await call_next(request)
        response.headers[self._header] = request_id
        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response: Response | None = None
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            user_id = getattr(request.state, "user_id", None)
            request_id = getattr(request.state, "request_id", None)

            bind_request_context(
                request_id=request_id or "unknown",
                user_id=user_id,
            )
            logger.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=duration_ms,
                request_id=request_id,
                user_id=user_id,
            )
