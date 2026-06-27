"""
RAG retrieval service for fetching relevant context from ChromaDB.
Retrieves rubrics, course notes, and sample solutions for grading.
"""
import uuid
from dataclasses import dataclass, asdict
from typing import List, Optional
import structlog

from sqlalchemy.orm import Session

from app.infrastructure.chromadb_client import ChromaDBClient
from app.rag.embeddings import EmbeddingService
from app.core.enums import DocumentType
from app.models.document import Document
from app.models.document_chunk import DocumentChunk

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
    rubric_chunks: List[RetrievedChunk]
    notes_chunks: List[RetrievedChunk]
    sample_chunks: List[RetrievedChunk]
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
        
        # Retrieve rubric chunks (all chunks, rubric must be complete)
        rubric_chunks = self._query_collection(
            collection_name=collection_name,
            query_embedding=query_embedding,
            n_results=50,  # Get all rubric chunks
            where_filter={
                "doc_type": DocumentType.RUBRIC.value,
                "assignment_id": str(assignment_id),
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
        sample_chunks = self._query_collection(
            collection_name=collection_name,
            query_embedding=query_embedding,
            n_results=3,
            where_filter={
                "doc_type": DocumentType.SAMPLE_SOLUTION.value,
                "assignment_id": str(assignment_id),
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
        query_embedding: List[float],
        n_results: int,
        where_filter: dict,
        db_session: Session,
    ) -> List[RetrievedChunk]:
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
            
            # Map results to RetrievedChunk objects
            retrieved_chunks = []
            for result in results:
                metadata = result.get("metadata", {})
                
                # Get source document name from database
                document_id_str = metadata.get("document_id", "")
                source_name = "Unknown"
                
                if document_id_str:
                    try:
                        doc = db_session.query(Document).filter(
                            Document.id == uuid.UUID(document_id_str)
                        ).first()
                        if doc:
                            source_name = doc.file_name
                    except Exception as e:
                        logger.warning(
                            "document_lookup_failed",
                            document_id=document_id_str,
                            error=str(e),
                        )
                
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
