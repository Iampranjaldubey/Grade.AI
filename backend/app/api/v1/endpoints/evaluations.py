from fastapi import APIRouter, Depends

from app.core.deps import get_current_professor
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="List evaluations",
    description="List AI and manual evaluations for assignments.",
)
async def list_evaluations(
    _professor: User = Depends(get_current_professor),
) -> list[dict[str, str]]:
    return []
