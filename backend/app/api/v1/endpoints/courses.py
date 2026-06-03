from fastapi import APIRouter, Depends

from app.core.deps import get_current_professor
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="List courses",
    description="List courses for the authenticated professor.",
)
async def list_courses(
    _professor: User = Depends(get_current_professor),
) -> list[dict[str, str]]:
    return []
