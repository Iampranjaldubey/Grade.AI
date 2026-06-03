"""initial GradeAI schema

Revision ID: 001
Revises:
Create Date: 2026-05-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    ]


UUID_PK = sa.Column(
    postgresql.UUID(as_uuid=True),
    primary_key=True,
    server_default=sa.text("gen_random_uuid()"),
    nullable=False,
)

TABLES_WITH_UPDATED_AT = (
    "users",
    "courses",
    "enrollments",
    "assignments",
    "rubrics",
    "documents",
    "document_chunks",
    "submissions",
    "evaluations",
    "audit_logs",
)

user_role = postgresql.ENUM(
    "professor", "student", "ta", "admin", name="user_role", create_type=False
)
enrollment_status = postgresql.ENUM(
    "active", "dropped", name="enrollment_status", create_type=False
)
grading_mode = postgresql.ENUM("auto", "manual", "hybrid", name="grading_mode", create_type=False)
document_type = postgresql.ENUM(
    "rubric",
    "notes",
    "sample_solution",
    "submission",
    name="document_type",
    create_type=False,
)
parse_status = postgresql.ENUM(
    "pending", "success", "failed", name="parse_status", create_type=False
)
submission_status = postgresql.ENUM(
    "submitted",
    "evaluating",
    "evaluated",
    "late",
    name="submission_status",
    create_type=False,
)
approval_status = postgresql.ENUM(
    "pending", "approved", "overridden", name="approval_status", create_type=False
)


def _create_enum_types() -> None:
    for enum in (
        user_role,
        enrollment_status,
        grading_mode,
        document_type,
        parse_status,
        submission_status,
        approval_status,
    ):
        enum.create(op.get_bind(), checkfirst=True)


def _drop_enum_types() -> None:
    for enum in (
        approval_status,
        submission_status,
        parse_status,
        document_type,
        grading_mode,
        enrollment_status,
        user_role,
    ):
        enum.drop(op.get_bind(), checkfirst=True)


def _create_updated_at_function() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def _create_updated_at_triggers() -> None:
    for table in TABLES_WITH_UPDATED_AT:
        op.execute(
            f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
            """
        )


def _drop_updated_at_triggers() -> None:
    for table in TABLES_WITH_UPDATED_AT:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table};")


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')
    _create_enum_types()
    _create_updated_at_function()

    op.create_table(
        "users",
        UUID_PK,
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "courses",
        UUID_PK,
        sa.Column("course_name", sa.String(length=255), nullable=False),
        sa.Column("course_code", sa.String(length=64), nullable=False),
        sa.Column(
            "professor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("semester", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.UniqueConstraint("professor_id", "course_code", name="uq_courses_professor_course_code"),
    )
    op.create_index("ix_courses_professor_id", "courses", ["professor_id"])
    op.create_index("ix_courses_course_code", "courses", ["course_code"])
    op.create_index("ix_courses_semester", "courses", ["semester"])

    op.create_table(
        "enrollments",
        UUID_PK,
        sa.Column(
            "course_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "status",
            enrollment_status,
            nullable=False,
            server_default="active",
        ),
        *_timestamps(),
        sa.UniqueConstraint("course_id", "student_id", name="uq_enrollments_course_student"),
    )
    op.create_index("ix_enrollments_course_id", "enrollments", ["course_id"])
    op.create_index("ix_enrollments_student_id", "enrollments", ["student_id"])
    op.create_index("ix_enrollments_status", "enrollments", ["status"])

    op.create_table(
        "assignments",
        UUID_PK,
        sa.Column(
            "course_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_score", sa.Numeric(10, 2), nullable=False),
        sa.Column("grading_mode", grading_mode, nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_assignments_course_id", "assignments", ["course_id"])
    op.create_index("ix_assignments_due_date", "assignments", ["due_date"])
    op.create_index("ix_assignments_grading_mode", "assignments", ["grading_mode"])

    op.create_table(
        "rubrics",
        UUID_PK,
        sa.Column(
            "assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assignments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("criteria_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("max_points", sa.Numeric(10, 2), nullable=False),
        sa.Column("weight", sa.Numeric(5, 4), nullable=False),
        sa.Column("evaluation_hints", sa.Text(), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_rubrics_assignment_id", "rubrics", ["assignment_id"])

    op.create_table(
        "documents",
        UUID_PK,
        sa.Column(
            "course_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assignments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "uploader_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("doc_type", document_type, nullable=False),
        sa.Column("file_name", sa.String(length=512), nullable=False),
        sa.Column("file_url", sa.String(length=2048), nullable=False),
        sa.Column("mime_type", sa.String(length=127), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("parsed_text", sa.Text(), nullable=True),
        sa.Column(
            "parse_status",
            parse_status,
            nullable=False,
            server_default="pending",
        ),
        *_timestamps(),
    )
    op.create_index("ix_documents_course_id", "documents", ["course_id"])
    op.create_index("ix_documents_assignment_id", "documents", ["assignment_id"])
    op.create_index("ix_documents_uploader_id", "documents", ["uploader_id"])
    op.create_index("ix_documents_doc_type", "documents", ["doc_type"])
    op.create_index("ix_documents_parse_status", "documents", ["parse_status"])

    op.create_table(
        "document_chunks",
        UUID_PK,
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("embedding_id", sa.String(length=255), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index("ix_document_chunks_embedding_id", "document_chunks", ["embedding_id"])
    op.create_index(
        "ix_document_chunks_document_chunk_index",
        "document_chunks",
        ["document_id", "chunk_index"],
        unique=True,
    )

    op.create_table(
        "submissions",
        UUID_PK,
        sa.Column(
            "assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assignments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_url", sa.String(length=2048), nullable=False),
        sa.Column("file_name", sa.String(length=512), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "status",
            submission_status,
            nullable=False,
            server_default="submitted",
        ),
        *_timestamps(),
        sa.UniqueConstraint("assignment_id", "student_id", name="uq_submissions_assignment_student"),
    )
    op.create_index("ix_submissions_assignment_id", "submissions", ["assignment_id"])
    op.create_index("ix_submissions_student_id", "submissions", ["student_id"])
    op.create_index("ix_submissions_submitted_at", "submissions", ["submitted_at"])
    op.create_index("ix_submissions_status", "submissions", ["status"])

    op.create_table(
        "evaluations",
        UUID_PK,
        sa.Column(
            "submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ai_score", sa.Numeric(10, 2), nullable=False),
        sa.Column("final_score", sa.Numeric(10, 2), nullable=True),
        sa.Column("ai_feedback", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("professor_feedback", sa.Text(), nullable=True),
        sa.Column("strengths", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("weaknesses", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("missing_topics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("retrieved_chunks", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approval_status",
            approval_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("submission_id", name="uq_evaluations_submission_id"),
    )
    op.create_index("ix_evaluations_submission_id", "evaluations", ["submission_id"], unique=True)
    op.create_index("ix_evaluations_approved_by", "evaluations", ["approved_by"])
    op.create_index("ix_evaluations_approval_status", "evaluations", ["approval_status"])
    op.create_index("ix_evaluations_evaluated_at", "evaluations", ["evaluated_at"])

    op.create_table(
        "audit_logs",
        UUID_PK,
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("entity_type", sa.String(length=128), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    _create_updated_at_triggers()


def downgrade() -> None:
    _drop_updated_at_triggers()
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column();")

    op.drop_table("audit_logs")
    op.drop_table("evaluations")
    op.drop_table("submissions")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("rubrics")
    op.drop_table("assignments")
    op.drop_table("enrollments")
    op.drop_table("courses")
    op.drop_table("users")

    _drop_enum_types()
