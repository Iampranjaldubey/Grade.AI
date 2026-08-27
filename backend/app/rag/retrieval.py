"""
RAG retrieval service for fetching relevant context from ChromaDB.
Retrieves rubrics, course notes, and sample solutions for grading.
"""

import uuid
from dataclasses import asdict, dataclass

import structlog
from sqlalchemy.orm import Session

from app.core.enums import DocumentType
from app.infrastructure.chromadb_client import ChromaDBClient
from app.models.document import Document
from app.rag.embeddings import EmbeddingService

logger = structlog.get_logger(__name__)


@dataclass
class RetrievedChunk:
    """Single retrieved chunk from ChromaDB."""

    chunk_text: str
    document_id: str
    doc_type: str
    relevance_score: float  # Lower is better (distance metric)
    chunk_index: int
    source_name: str


@dataclass
class RetrievalResult:
    """Complete retrieval result with all context types."""

    rubric_chunks: list[RetrievedChunk]
    notes_chunks: list[RetrievedChunk]
    sample_chunks: list[RetrievedChunk]
    total_token_estimate: int

    def to_dict(self):
        """Convert to dict for JSON serialization."""
        return {
            "rubric_chunks": [asdict(chunk) for chunk in self.rubric_chunks],
            "notes_chunks": [asdict(chunk) for chunk in self.notes_chunks],
            "sample_chunks": [asdict(chunk) for chunk in self.sample_chunks],
            "total_token_estimate": self.total_token_estimate,
        }


class RetrievalService:
    """
    Service for retrieving relevant context from ChromaDB for AI grading.
    Fetches rubrics, course notes, and sample solutions.
    """

    def __init__(
        self,
        chroma_client: ChromaDBClient,
        embedding_service: EmbeddingService,
    ):
        """
        Initialize retrieval service.

        Args:
            chroma_client: ChromaDB client instance
            embedding_service: Embedding generation service
        """
        self.chroma = chroma_client
        self.embeddings = embedding_service

    def retrieve_context(
        self,
        submission_text: str,
        assignment_id: uuid.UUID,
        course_id: uuid.UUID,
        db_session: Session,
    ) -> RetrievalResult:
        """
        Retrieve all relevant context for grading a submission.

        Args:
            submission_text: The student's submission text
            assignment_id: ID of the assignment
            course_id: ID of the course
            db_session: Synchronous database session

        Returns:
            RetrievalResult with rubrics, notes, and sample solution chunks
        """
        collection_name = f"gradeai_{str(course_id)}"

        # Check if collection exists
        if not self.chroma.collection_exists(collection_name):
            logger.warning(
                "collection_not_found",
                collection=collection_name,
                course_id=str(course_id),
            )
            return RetrievalResult(
                rubric_chunks=[],
                notes_chunks=[],
                sample_chunks=[],
                total_token_estimate=0,
            )

        # Generate embedding for submission text
        query_embedding = self.embeddings.embed_single(submission_text)

        # Retrieve rubric chunks - only used for source attribution (retrieved_sources),
        # not for grading content. Actual rubric criteria come from the relational
        # rubrics table (see evaluator.py).
        # ChromaDB requires $and operator for multiple conditions
        rubric_chunks = self._query_collection(
            collection_name=collection_name,
            query_embedding=query_embedding,
            n_results=5,  # Small sample for source file names only
            where_filter={
                "$and": [
                    {"doc_type": DocumentType.RUBRIC.value},
                    {"assignment_id": str(assignment_id)},
                ]
            },
            db_session=db_session,
        )

        # Retrieve course notes chunks (top 5 most relevant)
        notes_chunks = self._query_collection(
            collection_name=collection_name,
            query_embedding=query_embedding,
            n_results=5,
            where_filter={
                "doc_type": DocumentType.NOTES.value,
            },
            db_session=db_session,
        )

        # Retrieve sample solution chunks (top 3 most relevant)
        # ChromaDB requires $and operator for multiple conditions
        sample_chunks = self._query_collection(
            collection_name=collection_name,
            query_embedding=query_embedding,
            n_results=3,
            where_filter={
                "$and": [
                    {"doc_type": DocumentType.SAMPLE_SOLUTION.value},
                    {"assignment_id": str(assignment_id)},
                ]
            },
            db_session=db_session,
        )

        # Estimate token count (rough estimate: 1 token ≈ 4 chars)
        total_chars = sum(
            len(chunk.chunk_text)
            for chunks in [rubric_chunks, notes_chunks, sample_chunks]
            for chunk in chunks
        )
        total_token_estimate = total_chars // 4

        logger.info(
            "context_retrieved",
            course_id=str(course_id),
            assignment_id=str(assignment_id),
            rubric_count=len(rubric_chunks),
            notes_count=len(notes_chunks),
            sample_count=len(sample_chunks),
            token_estimate=total_token_estimate,
        )

        return RetrievalResult(
            rubric_chunks=rubric_chunks,
            notes_chunks=notes_chunks,
            sample_chunks=sample_chunks,
            total_token_estimate=total_token_estimate,
        )

    def _query_collection(
        self,
        collection_name: str,
        query_embedding: list[float],
        n_results: int,
        where_filter: dict,
        db_session: Session,
    ) -> list[RetrievedChunk]:
        """
        Query ChromaDB collection and map results to RetrievedChunk objects.

        Args:
            collection_name: Name of the ChromaDB collection
            query_embedding: Embedding vector for similarity search
            n_results: Number of results to retrieve
            where_filter: Metadata filter for the query
            db_session: Database session for fetching document metadata

        Returns:
            List of RetrievedChunk objects
        """
        try:
            results = self.chroma.query(
                collection_name=collection_name,
                query_embedding=query_embedding,
                n_results=n_results,
                where_filter=where_filter,
            )

            if not results:
                return []

            # Batch-fetch all source document names in a single query instead of
            # one lookup per chunk (avoids an N+1 on the grading hot path).
            doc_ids: set[uuid.UUID] = set()
            for result in results:
                did = result.get("metadata", {}).get("document_id", "")
                if did:
                    try:
                        doc_ids.add(uuid.UUID(did))
                    except (ValueError, TypeError):
                        continue

            name_by_id: dict[str, str] = {}
            if doc_ids:
                try:
                    docs = db_session.query(Document).filter(Document.id.in_(doc_ids)).all()
                    name_by_id = {str(d.id): d.file_name for d in docs}
                except Exception as e:
                    logger.warning("document_lookup_failed", error=str(e))

            # Map results to RetrievedChunk objects
            retrieved_chunks = []
            for result in results:
                metadata = result.get("metadata", {})
                document_id_str = metadata.get("document_id", "")
                source_name = name_by_id.get(document_id_str, "Unknown")

                chunk = RetrievedChunk(
                    chunk_text=result.get("document", ""),
                    document_id=document_id_str,
                    doc_type=metadata.get("doc_type", ""),
                    relevance_score=result.get("distance", 1.0),
                    chunk_index=metadata.get("chunk_index", 0),
                    source_name=source_name,
                )
                retrieved_chunks.append(chunk)

            return retrieved_chunks

        except Exception as exc:
            logger.error(
                "query_collection_failed",
                collection=collection_name,
                error=str(exc),
                where_filter=where_filter,
            )
            # Return empty list gracefully instead of crashing
            return []
