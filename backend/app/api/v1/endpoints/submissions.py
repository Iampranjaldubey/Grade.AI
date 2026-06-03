from fastapi import APIRouter, Depends

from app.core.deps import get_current_student
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="List submissions",
    description="List submissions for the authenticated student.",
)
async def list_submissions(
    _student: User = Depends(get_current_student),
) -> list[dict[str, str]]:
    return []
