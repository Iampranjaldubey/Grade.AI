from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import DocumentType, ParseStatus
from app.db.types import pg_enum
from app.db.session import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.course import Course
    from app.models.document_chunk import DocumentChunk
    from app.models.user import User


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploader_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[DocumentType] = mapped_column(
        pg_enum(DocumentType, "document_type"),
        nullable=False,
        index=True,
    )
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    file_key: Mapped[str] = mapped_column(String(1024), nullable=False, default="", server_default="")
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    parsed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[ParseStatus] = mapped_column(
        pg_enum(ParseStatus, "parse_status"),
        nullable=False,
        default=ParseStatus.PENDING,
        server_default=ParseStatus.PENDING.value,
        index=True,
    )

    course: Mapped["Course"] = relationship(
        "Course",
        back_populates="documents",
        foreign_keys=[course_id],
    )
    assignment: Mapped["Assignment | None"] = relationship(
        "Assignment",
        back_populates="documents",
        foreign_keys=[assignment_id],
    )
    uploader: Mapped["User"] = relationship(
        "User",
        back_populates="documents_uploaded",
        foreign_keys=[uploader_id],
    )
    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )
