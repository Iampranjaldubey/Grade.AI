"""
Text chunking utilities for splitting documents into manageable pieces.
"""
import structlog
from typing import List

logger = structlog.get_logger(__name__)


def count_tokens(text: str) -> int:
    """
    Approximate token count using word-based estimation.
    Uses 1.3x multiplier (typical for English text).
    
    Args:
        text: Text to count tokens for
        
    Returns:
        Approximate token count
    """
    words = text.split()
    return int(len(words) * 1.3)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[dict]:
    """
    Split text into overlapping chunks based on approximate token count.
    
    Uses word-based splitting with overlap to maintain context across chunks.
    Each chunk is approximately chunk_size tokens, with overlap tokens shared
    between consecutive chunks.
    
    Args:
        text: Text to chunk
        chunk_size: Target size in tokens for each chunk (default: 500)
        overlap: Number of tokens to overlap between chunks (default: 50)
        
    Returns:
        List of chunk dictionaries with:
            - chunk_index: Sequential index starting from 0
            - text: The chunk text
            - token_count: Approximate token count
            - char_count: Character count
            
    Example:
        >>> chunks = chunk_text("This is a long document...", chunk_size=100, overlap=20)
        >>> len(chunks)
        5
        >>> chunks[0]["chunk_index"]
        0
    """
    if not text or not text.strip():
        logger.warning("chunk_text_empty_input")
        return []
    
    # Split into words
    words = text.split()
    
    if not words:
        return []
    
    # Convert token sizes to word counts (divide by 1.3)
    words_per_chunk = int(chunk_size / 1.3)
    words_overlap = int(overlap / 1.3)
    
    # Ensure minimum viable sizes
    words_per_chunk = max(words_per_chunk, 50)  # At least 50 words per chunk
    words_overlap = min(words_overlap, words_per_chunk // 2)  # Overlap can't be more than half chunk
    
    chunks = []
    chunk_index = 0
    start_idx = 0
    
    while start_idx < len(words):
        # Get chunk of words
        end_idx = min(start_idx + words_per_chunk, len(words))
        chunk_words = words[start_idx:end_idx]
        chunk_text = " ".join(chunk_words)
        
        # Calculate stats
        token_count = count_tokens(chunk_text)
        char_count = len(chunk_text)
        
        chunks.append({
            "chunk_index": chunk_index,
            "text": chunk_text,
            "token_count": token_count,
            "char_count": char_count,
        })
        
        chunk_index += 1
        
        # Move to next chunk with overlap
        # If this is the last chunk, break
        if end_idx >= len(words):
            break
            
        start_idx = end_idx - words_overlap
    
    logger.info(
        "text_chunked",
        total_words=len(words),
        num_chunks=len(chunks),
        chunk_size=chunk_size,
        overlap=overlap,
    )
    
    return chunks


def chunk_text_by_sentences(text: str, chunk_size: int = 500, overlap: int = 50) -> List[dict]:
    """
    Split text into chunks by sentences (more semantic than word-based).
    This is an alternative chunking strategy that preserves sentence boundaries.
    
    Args:
        text: Text to chunk
        chunk_size: Target size in tokens for each chunk
        overlap: Number of tokens to overlap between chunks
        
    Returns:
        List of chunk dictionaries
    """
    import re
    
    # Simple sentence splitting (can be improved with NLP libraries)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    if not sentences:
        return []
    
    chunks = []
    chunk_index = 0
    current_chunk = []
    current_tokens = 0
    
    for sentence in sentences:
        sentence_tokens = count_tokens(sentence)
        
        # If adding this sentence would exceed chunk_size, save current chunk
        if current_tokens + sentence_tokens > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append({
                "chunk_index": chunk_index,
                "text": chunk_text,
                "token_count": count_tokens(chunk_text),
                "char_count": len(chunk_text),
            })
            chunk_index += 1
            
            # Keep last few sentences for overlap
            overlap_tokens = 0
            overlap_sentences = []
            for sent in reversed(current_chunk):
                sent_tokens = count_tokens(sent)
                if overlap_tokens + sent_tokens <= overlap:
                    overlap_sentences.insert(0, sent)
                    overlap_tokens += sent_tokens
                else:
                    break
            
            current_chunk = overlap_sentences
            current_tokens = overlap_tokens
        
        current_chunk.append(sentence)
        current_tokens += sentence_tokens
    
    # Add remaining text as final chunk
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        chunks.append({
            "chunk_index": chunk_index,
            "text": chunk_text,
            "token_count": count_tokens(chunk_text),
            "char_count": len(chunk_text),
        })
    
    logger.info(
        "text_chunked_by_sentences",
        num_sentences=len(sentences),
        num_chunks=len(chunks),
    )
    
    return chunks
