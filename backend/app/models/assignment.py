from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import GradingMode
from app.db.types import pg_enum
from app.db.session import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.document import Document
    from app.models.rubric import Rubric
    from app.models.submission import Submission


class Assignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assignments"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    max_score: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    grading_mode: Mapped[GradingMode] = mapped_column(
        pg_enum(GradingMode, "grading_mode"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    course: Mapped["Course"] = relationship("Course", back_populates="assignments")
    rubrics: Mapped[List["Rubric"]] = relationship(
        "Rubric",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )
    documents: Mapped[List["Document"]] = relationship(
        "Document",
        back_populates="assignment",
        foreign_keys="Document.assignment_id",
    )
    submissions: Mapped[List["Submission"]] = relationship(
        "Submission",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )
