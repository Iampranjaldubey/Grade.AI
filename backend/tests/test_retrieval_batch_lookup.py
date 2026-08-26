"""
Test for Finding #8: RetrievalService._query_collection batch-fetches source
document names in a single query rather than one lookup per chunk (N+1).
"""
import uuid
from unittest.mock import MagicMock

import pytest

from app.rag.retrieval import RetrievalService


def _result(doc_id: str, text: str, idx: int) -> dict:
    return {
        "document": text,
        "metadata": {"document_id": doc_id, "doc_type": "notes", "chunk_index": idx},
        "distance": 0.1,
    }


def test_query_collection_batch_fetches_documents_once() -> None:
    id_a = str(uuid.uuid4())
    id_b = str(uuid.uuid4())
    # 5 chunks across 2 documents (id_a repeated) -> still ONE db query.
    chroma_results = [
        _result(id_a, "chunk 0", 0),
        _result(id_a, "chunk 1", 1),
        _result(id_b, "chunk 2", 0),
        _result(id_a, "chunk 3", 2),
        _result(id_b, "chunk 4", 1),
    ]
    chroma = MagicMock()
    chroma.query.return_value = chroma_results

    doc_a = MagicMock(); doc_a.id = uuid.UUID(id_a); doc_a.file_name = "notes_a.pdf"
    doc_b = MagicMock(); doc_b.id = uuid.UUID(id_b); doc_b.file_name = "notes_b.pdf"

    db_session = MagicMock()
    db_session.query.return_value.filter.return_value.all.return_value = [doc_a, doc_b]

    service = RetrievalService(chroma, MagicMock())
    chunks = service._query_collection(
        collection_name="gradeai_x",
        query_embedding=[0.1, 0.2],
        n_results=5,
        where_filter={"doc_type": "notes"},
        db_session=db_session,
    )

    # Exactly one DB round trip for all 5 chunks / 2 documents.
    assert db_session.query.call_count == 1
    assert len(chunks) == 5
    # Source names mapped correctly from the batch result.
    names = {c.chunk_text: c.source_name for c in chunks}
    assert names["chunk 0"] == "notes_a.pdf"
    assert names["chunk 2"] == "notes_b.pdf"


def test_query_collection_unknown_source_when_doc_missing() -> None:
    id_a = str(uuid.uuid4())
    chroma = MagicMock()
    chroma.query.return_value = [_result(id_a, "orphan chunk", 0)]

    db_session = MagicMock()
    db_session.query.return_value.filter.return_value.all.return_value = []  # no docs found

    service = RetrievalService(chroma, MagicMock())
    chunks = service._query_collection(
        collection_name="gradeai_x",
        query_embedding=[0.1],
        n_results=1,
        where_filter={},
        db_session=db_session,
    )
    assert len(chunks) == 1
    assert chunks[0].source_name == "Unknown"
