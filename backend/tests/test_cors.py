"""
Test for Finding #14: CORS is scoped to specific methods/headers rather than
wildcarding while credentials are enabled.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_preflight_returns_scoped_methods_not_wildcard(client: AsyncClient) -> None:
    # Origin must be one of the configured cors_origins for the middleware to respond.
    resp = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert resp.status_code in (200, 204)
    allow_methods = resp.headers.get("access-control-allow-methods", "")
    assert "*" not in allow_methods
    assert "POST" in allow_methods
    assert "DELETE" in allow_methods

    allow_headers = resp.headers.get("access-control-allow-headers", "")
    assert "*" not in allow_headers
    assert "Authorization" in allow_headers
