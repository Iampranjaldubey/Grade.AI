from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    status: str = Field(description="ok | unavailable | degraded")


class HealthResponse(BaseModel):
    status: str = Field(description="Overall application status")
    version: str
    db: ServiceStatus
    redis: ServiceStatus
    chromadb: ServiceStatus
