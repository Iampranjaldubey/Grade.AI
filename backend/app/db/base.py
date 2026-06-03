from app.db.session import Base

from app.models import (  # noqa: F401
    Assignment,
    AuditLog,
    Course,
    Document,
    DocumentChunk,
    Enrollment,
    Evaluation,
    Rubric,
    Submission,
    User,
)

__all__ = ["Base"]
