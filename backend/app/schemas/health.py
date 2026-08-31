from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    status: str = Field(description="ok | unavailable | degraded")


class HealthResponse(BaseModel):
    status: str = Field(description="Overall application status")
    version: str
    db: ServiceStatus
    redis: ServiceStatus
    chromadb: ServiceStatus


class LivenessResponse(BaseModel):
    """Process-level liveness. Deliberately checks no dependencies."""

    status: str = Field(default="ok", description="Always 'ok' if the process responds")
    version: str
