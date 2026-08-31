"""
Tests for the health/liveness endpoints.

The readiness endpoint previously always returned HTTP 200 regardless of
dependency state, which meant ECS container health checks and ALB target-group
probes could never fail — a container with a dead database stayed in service.
"""

import pytest
from httpx import AsyncClient

from app.api.v1.endpoints.health import resolve_health


class TestResolveHealth:
    """The status decision, covered exhaustively without HTTP plumbing."""

    def test_all_dependencies_up_is_ok(self) -> None:
        assert resolve_health(True, True, True) == ("ok", 200)

    def test_chromadb_down_is_degraded_but_still_serving(self) -> None:
        """RAG retrieval degrades, but auth and CRUD still work."""
        assert resolve_health(True, True, False) == ("degraded", 200)

    def test_database_down_is_unavailable(self) -> None:
        assert resolve_health(False, True, True) == ("unavailable", 503)

    def test_redis_down_is_unavailable(self) -> None:
        """Redis holds the token allowlist/blacklist, so auth can't be trusted."""
        assert resolve_health(True, False, True) == ("unavailable", 503)

    def test_everything_down_is_unavailable(self) -> None:
        assert resolve_health(False, False, False) == ("unavailable", 503)


@pytest.mark.asyncio
async def test_liveness_needs_no_dependencies(client: AsyncClient) -> None:
    """
    Liveness must not consult dependencies: a transient database blip should not
    make an orchestrator kill and restart an otherwise healthy process.
    """
    response = await client.get("/api/v1/health/live")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_health_reports_each_dependency(client: AsyncClient) -> None:
    """
    The test harness drives the ASGI app without running its lifespan, so Redis
    and ChromaDB are never connected and correctly report as unavailable. That
    makes this a real assertion of the 503 path.
    """
    response = await client.get("/api/v1/health")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "unavailable"
    assert "version" in data
    # The database pool *is* initialised by the db_session fixture.
    assert data["db"]["status"] == "ok"
    assert data["redis"]["status"] == "unavailable"
    assert data["chromadb"]["status"] == "unavailable"
