from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.types import FlexibleJSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ApprovalStatus
from app.db.types import pg_enum
from app.db.session import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.submission import Submission
    from app.models.user import User


class Evaluation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "evaluations"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    ai_score: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    final_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    ai_feedback: Mapped[dict[str, Any] | None] = mapped_column(FlexibleJSON, nullable=True)
    professor_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    strengths: Mapped[list[Any] | None] = mapped_column(FlexibleJSON, nullable=True)
    weaknesses: Mapped[list[Any] | None] = mapped_column(FlexibleJSON, nullable=True)
    missing_topics: Mapped[list[Any] | None] = mapped_column(FlexibleJSON, nullable=True)
    retrieved_chunks: Mapped[list[Any] | None] = mapped_column(FlexibleJSON, nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        pg_enum(ApprovalStatus, "approval_status"),
        nullable=False,
        default=ApprovalStatus.PENDING,
        server_default=ApprovalStatus.PENDING.value,
        index=True,
    )
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submission: Mapped["Submission"] = relationship("Submission", back_populates="evaluation")
    approved_by_user: Mapped["User | None"] = relationship(
        "User",
        back_populates="evaluations_approved",
        foreign_keys=[approved_by],
    )
