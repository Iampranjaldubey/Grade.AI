"""
Tests for Finding #3 fix: a fallback evaluation (the placeholder 50% score
produced when AI grading fails entirely) must NEVER be auto-approved in AUTO
mode. It has to be held as `pending` so a professor reviews it, and be flagged
via ai_feedback["is_fallback"] rather than relying on confidence-score sorting.

Runs the REAL evaluate_submission Celery task via `.apply()` against a SQLite
engine. External services (ChromaDB, RetrievalService, GradingEvaluator) are
patched at their SOURCE modules because evaluate_submission imports them with
function-local imports.
"""

import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.enums import (
    ApprovalStatus,
    DocumentType,
    GradingMode,
    ParseStatus,
    SubmissionStatus,
)
from app.db.session import Base
from app.models.assignment import Assignment
from app.models.document import Document
from app.models.evaluation import Evaluation
from app.models.rubric import Rubric
from app.models.submission import Submission
from app.rag.evaluator import EvaluationResult
from app.rag.retrieval import RetrievalResult
from app.tasks.grading import evaluate_submission


@pytest.fixture
def sync_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def sync_session_factory(sync_engine):
    return sessionmaker(bind=sync_engine, expire_on_commit=False, autoflush=False)


@pytest.fixture(autouse=True)
def patch_task_dependencies(monkeypatch, sync_session_factory):
    """Redirect evaluate_submission's DB + external deps for the test."""

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

    # evaluate_submission uses a function-local `from app.db.sync_session import get_sync_db`
    monkeypatch.setattr("app.db.sync_session.get_sync_db", _get_sync_db)
    # ChromaDB + retrieval are irrelevant here; keep them inert.
    monkeypatch.setattr(
        "app.infrastructure.chromadb_client.ChromaDBClient", lambda settings: MagicMock()
    )
    mock_retrieval = MagicMock()
    mock_retrieval.retrieve_context.return_value = RetrievalResult([], [], [], 0)
    monkeypatch.setattr("app.rag.retrieval.RetrievalService", lambda *a, **k: mock_retrieval)


def _seed_submission(session_factory, grading_mode: GradingMode) -> str:
    """Insert assignment + rubric + submission + processed document; return submission id."""
    student_id = uuid.uuid4()
    course_id = uuid.uuid4()
    assignment_id = uuid.uuid4()
    submission_id = uuid.uuid4()

    session = session_factory()
    try:
        session.add(
            Assignment(
                id=assignment_id,
                course_id=course_id,
                title="Essay",
                description="desc",
                due_date=datetime.now(UTC) + timedelta(days=1),
                max_score=Decimal("100"),
                grading_mode=grading_mode,
                is_active=True,
            )
        )
        session.add(
            Rubric(
                assignment_id=assignment_id,
                criteria_name="Content",
                description="d",
                max_points=Decimal("100"),
                weight=Decimal("100"),
            )
        )
        session.add(
            Submission(
                id=submission_id,
                assignment_id=assignment_id,
                student_id=student_id,
                file_url="http://example.com/a.pdf",
                file_name="a.pdf",
                status=SubmissionStatus.SUBMITTED,
            )
        )
        session.add(
            Document(
                course_id=course_id,
                assignment_id=assignment_id,
                uploader_id=student_id,
                doc_type=DocumentType.SUBMISSION,
                file_name="a.pdf",
                file_url="http://example.com/a.pdf",
                file_key="k/a.pdf",
                mime_type="application/pdf",
                file_size_bytes=100,
                parsed_text="This is the student's parsed submission text for grading.",
                parse_status=ParseStatus.SUCCESS,
            )
        )
        session.commit()
    finally:
        session.close()
    return str(submission_id)


def _patch_evaluator(monkeypatch, *, is_fallback: bool) -> None:
    result = EvaluationResult(
        total_score=50.0 if is_fallback else 88.0,
        max_score=100.0,
        percentage=50.0 if is_fallback else 88.0,
        criteria_scores=[
            {"criterion_name": "Content", "awarded": 50.0, "max": 100.0, "reasoning": "x"}
        ],
        strengths=["s"],
        weaknesses=["w"],
        missing_topics=[],
        overall_feedback="feedback",
        confidence_score=0.0 if is_fallback else 0.9,
        retrieved_sources=[],
        is_fallback=is_fallback,
    )
    mock_evaluator = MagicMock()
    mock_evaluator.evaluate.return_value = result
    monkeypatch.setattr("app.rag.evaluator.GradingEvaluator", lambda settings: mock_evaluator)


def _load_evaluation(session_factory, submission_id: str) -> Evaluation:
    session = session_factory()
    try:
        return (
            session.query(Evaluation)
            .filter(Evaluation.submission_id == uuid.UUID(submission_id))
            .first()
        )
    finally:
        session.close()


def test_fallback_not_auto_approved_in_auto_mode(monkeypatch, sync_session_factory) -> None:
    """A fallback evaluation in AUTO mode must stay PENDING, not APPROVED."""
    _patch_evaluator(monkeypatch, is_fallback=True)
    submission_id = _seed_submission(sync_session_factory, GradingMode.AUTO)

    evaluate_submission.apply(args=[submission_id]).get()

    evaluation = _load_evaluation(sync_session_factory, submission_id)
    assert evaluation is not None
    assert evaluation.approval_status == ApprovalStatus.PENDING
    assert evaluation.final_score is None  # never surfaced to the student
    assert evaluation.ai_feedback["is_fallback"] is True


def test_genuine_evaluation_still_auto_approved_in_auto_mode(
    monkeypatch, sync_session_factory
) -> None:
    """A normal (non-fallback) AI evaluation in AUTO mode is still auto-approved."""
    _patch_evaluator(monkeypatch, is_fallback=False)
    submission_id = _seed_submission(sync_session_factory, GradingMode.AUTO)

    evaluate_submission.apply(args=[submission_id]).get()

    evaluation = _load_evaluation(sync_session_factory, submission_id)
    assert evaluation is not None
    assert evaluation.approval_status == ApprovalStatus.APPROVED
    assert evaluation.final_score == evaluation.ai_score
    assert evaluation.ai_feedback["is_fallback"] is False


def test_fallback_in_hybrid_mode_stays_pending(monkeypatch, sync_session_factory) -> None:
    """HYBRID never auto-approves anyway; a fallback there is still pending and flagged."""
    _patch_evaluator(monkeypatch, is_fallback=True)
    submission_id = _seed_submission(sync_session_factory, GradingMode.HYBRID)

    evaluate_submission.apply(args=[submission_id]).get()

    evaluation = _load_evaluation(sync_session_factory, submission_id)
    assert evaluation is not None
    assert evaluation.approval_status == ApprovalStatus.PENDING
    assert evaluation.ai_feedback["is_fallback"] is True
