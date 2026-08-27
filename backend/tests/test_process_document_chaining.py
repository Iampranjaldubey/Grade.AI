"""
Tests for Finding #9: process_document chains AI evaluation on successful
completion of a SUBMISSION document (auto/hybrid only), replacing the API-side
fixed 15s countdown. Non-submission docs and manual-mode submissions do not
chain.

Runs the real process_document task via eager .apply() with S3/ChromaDB mocked
and a real SQLite DB (same harness as the retry tests).
"""

import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.enums import DocumentType, GradingMode, ParseStatus, SubmissionStatus
from app.db.session import Base
from app.models.assignment import Assignment
from app.models.document import Document
from app.models.submission import Submission
from app.tasks import grading as grading_module
from app.tasks.grading import process_document

SAMPLE_TEXT = "This is a long enough student submission body for chunking. " * 10


@pytest.fixture
def sync_session_factory():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    engine.dispose()


@pytest.fixture(autouse=True)
def patch_deps(monkeypatch, sync_session_factory):
    @contextmanager
    def _get_sync_db():
        session = sync_session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    monkeypatch.setattr(grading_module, "get_sync_db", _get_sync_db)
    monkeypatch.setattr(grading_module, "_download_from_s3", lambda *a, **k: b"bytes")
    monkeypatch.setattr(grading_module, "parse_document", lambda *a, **k: SAMPLE_TEXT)
    monkeypatch.setattr(grading_module, "S3Service", lambda settings: MagicMock())
    chroma = MagicMock()
    collection = MagicMock()
    collection.name = "gradeai_c"
    chroma.get_or_create_collection.return_value = collection
    monkeypatch.setattr(grading_module, "ChromaDBClient", lambda settings: chroma)


def _seed(session_factory, grading_mode: GradingMode, doc_type: DocumentType) -> tuple[str, str]:
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    assignment_id = uuid.uuid4()
    submission_id = uuid.uuid4()
    document_id = uuid.uuid4()
    session = session_factory()
    try:
        session.add(
            Assignment(
                id=assignment_id,
                course_id=course_id,
                title="A",
                description="d",
                due_date=datetime.now(UTC) + timedelta(days=1),
                max_score=Decimal("100"),
                grading_mode=grading_mode,
                is_active=True,
            )
        )
        session.add(
            Submission(
                id=submission_id,
                assignment_id=assignment_id,
                student_id=student_id,
                file_url="http://x/a.pdf",
                file_name="a.pdf",
                status=SubmissionStatus.SUBMITTED,
            )
        )
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                assignment_id=assignment_id,
                uploader_id=student_id,
                doc_type=doc_type,
                file_name="a.pdf",
                file_url="http://x/a.pdf",
                file_key="k/a.pdf",
                mime_type="application/pdf",
                file_size_bytes=100,
                parse_status=ParseStatus.PENDING,
            )
        )
        session.commit()
    finally:
        session.close()
    return str(document_id), str(submission_id)


def test_submission_chains_evaluation_in_hybrid(monkeypatch, sync_session_factory) -> None:
    delay_mock = MagicMock()
    monkeypatch.setattr(grading_module.evaluate_submission, "delay", delay_mock)
    doc_id, submission_id = _seed(sync_session_factory, GradingMode.HYBRID, DocumentType.SUBMISSION)

    process_document.apply(args=[doc_id]).get()

    delay_mock.assert_called_once_with(submission_id)


def test_submission_chains_evaluation_in_auto(monkeypatch, sync_session_factory) -> None:
    delay_mock = MagicMock()
    monkeypatch.setattr(grading_module.evaluate_submission, "delay", delay_mock)
    doc_id, submission_id = _seed(sync_session_factory, GradingMode.AUTO, DocumentType.SUBMISSION)

    process_document.apply(args=[doc_id]).get()

    delay_mock.assert_called_once_with(submission_id)


def test_manual_submission_does_not_chain(monkeypatch, sync_session_factory) -> None:
    delay_mock = MagicMock()
    monkeypatch.setattr(grading_module.evaluate_submission, "delay", delay_mock)
    doc_id, _ = _seed(sync_session_factory, GradingMode.MANUAL, DocumentType.SUBMISSION)

    process_document.apply(args=[doc_id]).get()

    delay_mock.assert_not_called()


def test_non_submission_document_does_not_chain(monkeypatch, sync_session_factory) -> None:
    delay_mock = MagicMock()
    monkeypatch.setattr(grading_module.evaluate_submission, "delay", delay_mock)
    # A course notes document (auto assignment) must NOT trigger evaluation.
    doc_id, _ = _seed(sync_session_factory, GradingMode.AUTO, DocumentType.NOTES)

    process_document.apply(args=[doc_id]).get()

    delay_mock.assert_not_called()
