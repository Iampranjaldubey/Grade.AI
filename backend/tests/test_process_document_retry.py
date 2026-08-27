"""
Tests for the process_document poison-pill fix (see RETRY_BEHAVIOR_AUDIT_REPORT.md
and POISON_PILL_FIX_COMPLETE.md).

Runs the REAL Celery task body via `.apply()` (Celery's eager/synchronous mode),
which actually re-invokes the task function on `self.retry()` instead of just
scheduling it — so this exercises the true idempotency behavior, not a mock of it.

External dependencies (S3, ChromaDB) are mocked; the database is a real
SQLite engine created fresh per test so the DocumentChunk unique constraint
on (document_id, chunk_index) is genuinely enforced.
"""

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.enums import DocumentType, ParseStatus
from app.db.session import Base
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.tasks import grading as grading_module
from app.tasks.grading import process_document


@pytest.fixture
def sync_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def sync_session_factory(sync_engine):
    return sessionmaker(bind=sync_engine, expire_on_commit=False, autoflush=False)


@pytest.fixture
def patched_get_sync_db(monkeypatch, sync_session_factory):
    """Redirect grading.py's get_sync_db() to a SQLite-backed session for this test."""

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
    return _get_sync_db


@pytest.fixture
def sample_document(sync_session_factory) -> str:
    """Insert a Document row directly (FKs unchecked on plain SQLite) and return its id."""
    document_id = uuid.uuid4()
    session = sync_session_factory()
    try:
        doc = Document(
            id=document_id,
            course_id=uuid.uuid4(),
            assignment_id=uuid.uuid4(),
            uploader_id=uuid.uuid4(),
            doc_type=DocumentType.NOTES,
            file_name="notes.txt",
            file_url="http://example.com/notes.txt",
            file_key="course/notes.txt",
            mime_type="text/plain",
            file_size_bytes=1000,
            parse_status=ParseStatus.PENDING,
        )
        session.add(doc)
        session.commit()
    finally:
        session.close()
    return str(document_id)


SAMPLE_TEXT = (
    "This is a reasonably long piece of course material text used purely to "
    "exercise the chunking pipeline in the process_document task during tests. "
    "It needs to be long enough to produce more than one chunk so the unique "
    "constraint on document_id and chunk_index is actually exercised across "
    "multiple rows, not just a single row. " * 10
)


@pytest.fixture(autouse=True)
def patch_external_dependencies(monkeypatch):
    """Mock S3 download and ChromaDBClient; use real chunker + real embedding_service."""
    monkeypatch.setattr(grading_module, "_download_from_s3", lambda *a, **kw: b"irrelevant bytes")
    monkeypatch.setattr(grading_module, "parse_document", lambda *a, **kw: SAMPLE_TEXT)
    monkeypatch.setattr(grading_module, "S3Service", lambda settings: MagicMock())


def _make_chromadb_mock(add_chunks_side_effect=None) -> MagicMock:
    mock_client = MagicMock()
    mock_collection = MagicMock()
    mock_collection.name = "gradeai_test_course"
    mock_client.get_or_create_collection.return_value = mock_collection
    if add_chunks_side_effect is not None:
        mock_client.add_chunks.side_effect = add_chunks_side_effect
    return mock_client


def test_first_attempt_succeeds_with_no_cleanup_needed(
    monkeypatch, patched_get_sync_db, sample_document, sync_session_factory
) -> None:
    """Baseline: normal first-time processing works and chunks are stored once."""
    chromadb_mock = _make_chromadb_mock()
    monkeypatch.setattr(grading_module, "ChromaDBClient", lambda settings: chromadb_mock)

    result = process_document.apply(args=[sample_document]).get()

    assert result["status"] == "success"
    chromadb_mock.delete_document_chunks.assert_called_once()  # cleanup attempted (no-op)
    chromadb_mock.add_chunks.assert_called_once()

    session = sync_session_factory()
    try:
        chunks = (
            session.query(DocumentChunk)
            .filter(DocumentChunk.document_id == uuid.UUID(sample_document))
            .all()
        )
        assert len(chunks) == result["num_chunks"]
        assert len(chunks) > 1  # sanity check that our sample text produced multiple chunks
        doc = session.query(Document).filter(Document.id == uuid.UUID(sample_document)).first()
        assert doc.parse_status == ParseStatus.SUCCESS
    finally:
        session.close()


def test_retry_after_chromadb_failure_does_not_hit_integrity_error(
    monkeypatch, patched_get_sync_db, sample_document, sync_session_factory
) -> None:
    """
    THE poison-pill scenario: ChromaDB fails on the first attempt, AFTER chunks
    are already committed to Postgres. Before the fix, the retry's chunk-insert
    step would hit IntegrityError on (document_id, chunk_index) and mask the
    original ChromaDB error. After the fix, cleanup removes the stale chunks
    before re-inserting, so the retry succeeds cleanly.
    """
    call_count = {"n": 0}

    def flaky_add_chunks(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("simulated ChromaDB network failure")
        return None

    chromadb_mock = _make_chromadb_mock(add_chunks_side_effect=flaky_add_chunks)
    monkeypatch.setattr(grading_module, "ChromaDBClient", lambda settings: chromadb_mock)

    # process_document has max_retries=3 and uses self.retry(countdown=...).
    # Celery's eager .apply() executes retries synchronously and ignores countdown,
    # so this call runs the full retry loop in-process without any real delay.
    result = process_document.apply(args=[sample_document]).get()

    assert result["status"] == "success"
    assert call_count["n"] == 2  # failed once, succeeded on retry

    session = sync_session_factory()
    try:
        chunks = (
            session.query(DocumentChunk)
            .filter(DocumentChunk.document_id == uuid.UUID(sample_document))
            .all()
        )
        # Exactly one set of chunks should exist — not doubled, not zero.
        assert len(chunks) == result["num_chunks"]
        chunk_indexes = sorted(c.chunk_index for c in chunks)
        assert chunk_indexes == list(range(len(chunks)))  # no duplicate indexes

        doc = session.query(Document).filter(Document.id == uuid.UUID(sample_document)).first()
        assert doc.parse_status == ParseStatus.SUCCESS
    finally:
        session.close()


def test_cleanup_deletes_chunks_left_by_previous_failed_attempt(
    monkeypatch, patched_get_sync_db, sample_document, sync_session_factory
) -> None:
    """
    Directly verifies the Step 7 cleanup logic: pre-existing DocumentChunk rows
    for this document_id are deleted before the new insert loop runs, so no
    IntegrityError occurs and no duplicate/stale rows survive.
    """
    # Simulate a prior failed attempt that left 2 stale chunks behind.
    session = sync_session_factory()
    try:
        session.add(
            DocumentChunk(
                document_id=uuid.UUID(sample_document),
                chunk_index=0,
                chunk_text="stale chunk 0",
                token_count=5,
                embedding_id=str(uuid.uuid4()),
            )
        )
        session.add(
            DocumentChunk(
                document_id=uuid.UUID(sample_document),
                chunk_index=1,
                chunk_text="stale chunk 1",
                token_count=5,
                embedding_id=str(uuid.uuid4()),
            )
        )
        session.commit()
    finally:
        session.close()

    chromadb_mock = _make_chromadb_mock()
    monkeypatch.setattr(grading_module, "ChromaDBClient", lambda settings: chromadb_mock)

    result = process_document.apply(args=[sample_document]).get()

    assert result["status"] == "success"

    session = sync_session_factory()
    try:
        chunks = (
            session.query(DocumentChunk)
            .filter(DocumentChunk.document_id == uuid.UUID(sample_document))
            .all()
        )
        # Stale chunk_text from the fake prior attempt must be gone.
        texts = {c.chunk_text for c in chunks}
        assert "stale chunk 0" not in texts
        assert "stale chunk 1" not in texts
        assert len(chunks) == result["num_chunks"]
    finally:
        session.close()


def test_original_exception_preserved_when_status_update_fails_during_retry_handling(
    monkeypatch, patched_get_sync_db, sample_document
) -> None:
    """
    Per POISON_PILL_FIX_COMPLETE.md change #3: if _update_document_status()
    itself raises while handling a failure, the ORIGINAL exception must still
    be the one passed to self.retry()/re-raised — not the cleanup failure.
    """
    chromadb_mock = _make_chromadb_mock(
        add_chunks_side_effect=RuntimeError("original chromadb failure")
    )
    monkeypatch.setattr(grading_module, "ChromaDBClient", lambda settings: chromadb_mock)

    # Force _update_document_status to fail every time it's called inside the
    # except block, simulating "DB unreachable during failure handling".
    def broken_status_update(*args, **kwargs):
        raise RuntimeError("db unreachable during cleanup")

    monkeypatch.setattr(grading_module, "_update_document_status", broken_status_update)

    with pytest.raises(RuntimeError) as exc_info:
        process_document.apply(args=[sample_document]).get()

    # The exception surfaced after max_retries must be the ORIGINAL ChromaDB
    # error, not "db unreachable during cleanup".
    assert "original chromadb failure" in str(exc_info.value)
