from fastapi import APIRouter, Depends

from app.core.deps import get_current_professor
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="List assignments",
    description="List assignments across courses owned by the professor.",
)
async def list_assignments(
    _professor: User = Depends(get_current_professor),
) -> list[dict[str, str]]:
    return []
