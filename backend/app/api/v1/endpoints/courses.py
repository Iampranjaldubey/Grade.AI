import random
import string
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_current_professor, get_current_student
from app.core.enums import EnrollmentStatus
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.submission import Submission
from app.models.user import User
from app.schemas.course import CourseCreate, CourseListOut, CourseOut, CourseUpdate
from app.schemas.enrollment import EnrollmentOut, JoinCourseRequest

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_JOIN_CODE_CHARS = string.ascii_uppercase + string.digits


def _generate_join_code(length: int = 6) -> str:
    return "".join(random.choices(_JOIN_CODE_CHARS, k=length))


async def _unique_join_code(db: AsyncSession) -> str:
    """Generate a join code that doesn't already exist in the database."""
    for _ in range(10):
        code = _generate_join_code()
        result = await db.execute(select(Course).where(Course.join_code == code))
        if result.scalar_one_or_none() is None:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique join code. Please try again.",
    )


async def _course_with_counts(db: AsyncSession, course: Course) -> CourseListOut:
    """Fetch student_count and assignment_count for a single course."""
    student_count_q = await db.execute(
        select(func.count()).where(
            Enrollment.course_id == course.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )
    assignment_count_q = await db.execute(
        select(func.count()).where(
            Assignment.course_id == course.id,
            Assignment.is_active.is_(True),
        )
    )
    return CourseListOut(
        **CourseOut.model_validate(course).model_dump(),
        student_count=student_count_q.scalar_one(),
        assignment_count=assignment_count_q.scalar_one(),
    )


async def _get_professor_course(
    course_id: uuid.UUID,
    professor: User,
    db: AsyncSession,
) -> Course:
    """Fetch a course that belongs to the given professor, or raise 404."""
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.professor_id == professor.id)
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


# ---------------------------------------------------------------------------
# Course routes (professor)
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=CourseListOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new course",
)
async def create_course(
    payload: CourseCreate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> CourseListOut:
    # Check duplicate course_code for this professor
    result = await db.execute(
        select(Course).where(
            Course.professor_id == professor.id,
            Course.course_code == payload.course_code,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a course with code '{payload.course_code}'",
        )

    join_code = await _unique_join_code(db)

    course = Course(
        course_name=payload.course_name,
        course_code=payload.course_code,
        join_code=join_code,
        professor_id=professor.id,
        semester=payload.semester,
        description=payload.description,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return await _course_with_counts(db, course)


@router.get(
    "",
    response_model=List[CourseListOut],
    summary="List professor's courses",
)
async def list_courses(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> List[CourseListOut]:
    offset = (page - 1) * size
    result = await db.execute(
        select(Course)
        .where(Course.professor_id == professor.id)
        .order_by(Course.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    courses = result.scalars().all()
    return [await _course_with_counts(db, c) for c in courses]


@router.get(
    "/{course_id}",
    response_model=CourseListOut,
    summary="Get a single course",
)
async def get_course(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CourseListOut:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()

    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    # Professor must own the course
    if current_user.role == "professor":
        if course.professor_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    # Student must be actively enrolled
    elif current_user.role == "student":
        enrollment = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id,
                Enrollment.student_id == current_user.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
        )
        if enrollment.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not enrolled in this course")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return await _course_with_counts(db, course)


@router.put(
    "/{course_id}",
    response_model=CourseListOut,
    summary="Update a course",
)
async def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> CourseListOut:
    course = await _get_professor_course(course_id, professor, db)

    updates = payload.model_dump(exclude_unset=True)

    # If updating course_code, check for duplicates
    if "course_code" in updates and updates["course_code"] != course.course_code:
        dup = await db.execute(
            select(Course).where(
                Course.professor_id == professor.id,
                Course.course_code == updates["course_code"],
                Course.id != course_id,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"You already have a course with code '{updates['course_code']}'",
            )

    for field, value in updates.items():
        setattr(course, field, value)

    await db.commit()
    await db.refresh(course)
    return await _course_with_counts(db, course)


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a course",
)
async def delete_course(
    course_id: uuid.UUID,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> None:
    course = await _get_professor_course(course_id, professor, db)

    # Block if active enrollments exist
    active_enrollments = await db.execute(
        select(func.count()).where(
            Enrollment.course_id == course.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )
    if active_enrollments.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate a course with active enrollments. "
            "Ask students to drop the course first.",
        )

    course.is_active = False
    await db.commit()


@router.get(
    "/{course_id}/students",
    summary="List enrolled students for a course",
)
async def list_course_students(
    course_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> list:
    course = await _get_professor_course(course_id, professor, db)
    offset = (page - 1) * size

    # Subquery: count submissions per student for this course
    submission_count_subq = (
        select(Submission.student_id, func.count().label("submission_count"))
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.course_id == course.id)
        .group_by(Submission.student_id)
        .subquery()
    )

    rows = await db.execute(
        select(
            User.id,
            User.name,
            User.email,
            Enrollment.enrolled_at,
            func.coalesce(submission_count_subq.c.submission_count, 0).label("submission_count"),
        )
        .join(Enrollment, Enrollment.student_id == User.id)
        .outerjoin(submission_count_subq, submission_count_subq.c.student_id == User.id)
        .where(
            Enrollment.course_id == course.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
        .order_by(User.name)
        .offset(offset)
        .limit(size)
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "enrolled_at": row.enrolled_at,
            "submission_count": row.submission_count,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Enrollment routes — mounted at /enrollments via a separate router prefix
# ---------------------------------------------------------------------------

enrollments_router = APIRouter()


@enrollments_router.post(
    "/join",
    response_model=EnrollmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Join a course by join code",
)
async def join_course(
    payload: JoinCourseRequest,
    student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> EnrollmentOut:
    # Find active course by join_code
    result = await db.execute(
        select(Course).where(
            Course.join_code == payload.join_code.upper(),
            Course.is_active.is_(True),
        )
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active course found with that join code",
        )

    # Check student not already enrolled (active)
    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == course.id,
            Enrollment.student_id == student.id,
        )
    )
    existing_enrollment = existing.scalar_one_or_none()

    if existing_enrollment is not None:
        if existing_enrollment.status == EnrollmentStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already enrolled in this course",
            )
        # Re-activate a previously dropped enrollment
        existing_enrollment.status = EnrollmentStatus.ACTIVE
        await db.commit()
        await db.refresh(existing_enrollment)
        await db.refresh(course)
        existing_enrollment.course = course
        return EnrollmentOut.model_validate(existing_enrollment)

    enrollment = Enrollment(
        course_id=course.id,
        student_id=student.id,
        status=EnrollmentStatus.ACTIVE,
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    # Attach course for the response schema
    await db.refresh(course)
    enrollment.course = course
    return EnrollmentOut.model_validate(enrollment)


@enrollments_router.get(
    "/my-courses",
    response_model=List[CourseOut],
    summary="List courses the student is enrolled in",
)
async def my_courses(
    student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> List[CourseOut]:
    result = await db.execute(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
        .order_by(Course.created_at.desc())
    )
    courses = result.scalars().all()
    return [CourseOut.model_validate(c) for c in courses]


@enrollments_router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Drop (unenroll from) a course",
)
async def drop_course(
    course_id: uuid.UUID,
    student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )
    enrollment = result.scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active enrollment not found",
        )
    enrollment.status = EnrollmentStatus.DROPPED
    await db.commit()
