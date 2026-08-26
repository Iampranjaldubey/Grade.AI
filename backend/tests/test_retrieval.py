"""
Unit tests for RetrievalService.retrieve_context() — verifies the rubric
n_results fix (50 -> 5) and that where_filter conditions are correct for
each document type, per RETRIEVAL_CONFIG_AUDIT_REPORT.md.

ChromaDBClient and EmbeddingService are mocked; these tests only verify
the arguments RetrievalService passes to chroma.query(), not ChromaDB
itself.
"""
import uuid
from unittest.mock import MagicMock

import pytest

from app.rag.retrieval import RetrievalService


@pytest.fixture
def mock_chroma() -> MagicMock:
    chroma = MagicMock()
    chroma.collection_exists.return_value = True
    chroma.query.return_value = []
    return chroma


@pytest.fixture
def mock_embeddings() -> MagicMock:
    embeddings = MagicMock()
    embeddings.embed_single.return_value = [0.1, 0.2, 0.3]
    return embeddings


@pytest.fixture
def mock_db_session() -> MagicMock:
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = None
    return session


def test_rubric_query_uses_n_results_5(mock_chroma, mock_embeddings, mock_db_session) -> None:
    """Rubric chunks are only used for source attribution; n_results must be 5, not 50."""
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    rubric_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("$and", [{}])[0].get("doc_type") == "rubric"
    )
    assert rubric_call.kwargs["n_results"] == 5


def test_notes_query_uses_n_results_5(mock_chroma, mock_embeddings, mock_db_session) -> None:
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    notes_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("doc_type") == "notes"
    )
    assert notes_call.kwargs["n_results"] == 5


def test_sample_solution_query_uses_n_results_3(mock_chroma, mock_embeddings, mock_db_session) -> None:
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    sample_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("$and", [{}])[0].get("doc_type") == "sample_solution"
    )
    assert sample_call.kwargs["n_results"] == 3


def test_rubric_filter_uses_and_with_doc_type_and_assignment_id(
    mock_chroma, mock_embeddings, mock_db_session
) -> None:
    """Rubric where_filter must combine doc_type AND assignment_id via $and."""
    assignment_id = uuid.uuid4()
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=assignment_id,
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    rubric_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("$and", [{}])[0].get("doc_type") == "rubric"
    )
    conditions = rubric_call.kwargs["where_filter"]["$and"]
    assert {"doc_type": "rubric"} in conditions
    assert {"assignment_id": str(assignment_id)} in conditions


def test_sample_solution_filter_uses_and_with_doc_type_and_assignment_id(
    mock_chroma, mock_embeddings, mock_db_session
) -> None:
    assignment_id = uuid.uuid4()
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=assignment_id,
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    sample_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("$and", [{}])[0].get("doc_type") == "sample_solution"
    )
    conditions = sample_call.kwargs["where_filter"]["$and"]
    assert {"doc_type": "sample_solution"} in conditions
    assert {"assignment_id": str(assignment_id)} in conditions


def test_notes_filter_has_no_assignment_id_condition(
    mock_chroma, mock_embeddings, mock_db_session
) -> None:
    """Notes are course-level documents; filter must NOT restrict by assignment_id."""
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    notes_call = next(
        call for call in mock_chroma.query.call_args_list
        if call.kwargs["where_filter"].get("doc_type") == "notes"
    )
    assert notes_call.kwargs["where_filter"] == {"doc_type": "notes"}
    assert "$and" not in notes_call.kwargs["where_filter"]


def test_returns_empty_result_when_collection_does_not_exist(
    mock_chroma, mock_embeddings, mock_db_session
) -> None:
    mock_chroma.collection_exists.return_value = False
    service = RetrievalService(mock_chroma, mock_embeddings)

    result = service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )

    assert result.rubric_chunks == []
    assert result.notes_chunks == []
    assert result.sample_chunks == []
    assert result.total_token_estimate == 0
    mock_chroma.query.assert_not_called()


def test_three_queries_issued_for_rubric_notes_sample(
    mock_chroma, mock_embeddings, mock_db_session
) -> None:
    """Exactly 3 ChromaDB queries per retrieve_context call: rubric, notes, sample."""
    service = RetrievalService(mock_chroma, mock_embeddings)
    service.retrieve_context(
        submission_text="student answer",
        assignment_id=uuid.uuid4(),
        course_id=uuid.uuid4(),
        db_session=mock_db_session,
    )
    assert mock_chroma.query.call_count == 3
