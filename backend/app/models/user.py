from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserRole
from app.db.types import pg_enum
from app.db.session import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.course import Course
    from app.models.document import Document
    from app.models.enrollment import Enrollment
    from app.models.evaluation import Evaluation
    from app.models.submission import Submission


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    courses_taught: Mapped[List["Course"]] = relationship(
        "Course",
        back_populates="professor",
        foreign_keys="Course.professor_id",
    )
    enrollments: Mapped[List["Enrollment"]] = relationship(
        "Enrollment",
        back_populates="student",
        foreign_keys="Enrollment.student_id",
    )
    documents_uploaded: Mapped[List["Document"]] = relationship(
        "Document",
        back_populates="uploader",
        foreign_keys="Document.uploader_id",
    )
    submissions: Mapped[List["Submission"]] = relationship(
        "Submission",
        back_populates="student",
        foreign_keys="Submission.student_id",
    )
    evaluations_approved: Mapped[List["Evaluation"]] = relationship(
        "Evaluation",
        back_populates="approved_by_user",
        foreign_keys="Evaluation.approved_by",
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        foreign_keys="AuditLog.user_id",
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN
