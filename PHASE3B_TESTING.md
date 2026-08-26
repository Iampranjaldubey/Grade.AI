# Phase 3B Testing Guide - Document Processing Pipeline

## 🧪 Testing Checklist

### Prerequisites

1. **Install Dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
   
   This will install:
   - pdfplumber
   - python-docx
   - torch (CPU version)
   - sentence-transformers

2. **Infrastructure Running**
   ```bash
   # PostgreSQL
   psql -h localhost -U gradeai -d gradeai -c "SELECT 1;"
   
   # Redis
   redis-cli ping  # Should return: PONG
   
   # MinIO (S3)
   curl http://localhost:9000/minio/health/live  # Should return: OK
   
   # ChromaDB
   curl http://localhost:8001/api/v1/heartbeat  # Should return: 200
   ```

3. **Run Migrations**
   ```bash
   cd backend
   alembic upgrade head
   ```

4. **Start Backend**
   ```bash
   cd backend
   uvicorn app.main:app --reload
   # API at http://localhost:8000
   ```

5. **Start Celery Worker**
   ```bash
   cd backend
   celery -A app.celery_app worker --loglevel=info
   # Watch for task execution logs
   ```

---

## Test 1: Unit Test - PDF Parsing

### Create Test File

```python
# test_parsers.py
import pytest
from app.rag.parsers import parse_pdf, parse_docx, parse_txt, parse_document

def test_parse_pdf():
    """Test PDF parsing with a sample PDF."""
    # Create a simple PDF or use existing test file
    with open("tests/fixtures/sample_rubric.pdf", "rb") as f:
        file_bytes = f.read()
    
    text = parse_pdf(file_bytes)
    
    assert text is not None
    assert len(text) > 0
    assert isinstance(text, str)
    print(f"✓ Extracted {len(text)} characters from PDF")

def test_parse_docx():
    """Test DOCX parsing."""
    with open("tests/fixtures/sample_notes.docx", "rb") as f:
        file_bytes = f.read()
    
    text = parse_docx(file_bytes)
    
    assert text is not None
    assert len(text) > 0
    print(f"✓ Extracted {len(text)} characters from DOCX")

def test_parse_txt():
    """Test TXT parsing."""
    file_bytes = b"This is a test document.\nIt has multiple lines."
    
    text = parse_txt(file_bytes)
    
    assert "test document" in text
    print(f"✓ Parsed TXT: {text}")

def test_parse_document_router():
    """Test document router with different MIME types."""
    txt_bytes = b"Sample text"
    
    # Test TXT
    text = parse_document(txt_bytes, "text/plain")
    assert "Sample text" in text
    
    # Test unsupported type
    with pytest.raises(ValueError, match="Unsupported MIME type"):
        parse_document(txt_bytes, "application/json")
    
    print("✓ Document router works correctly")
```

### Run Test
```bash
cd backend
pytest tests/test_parsers.py -v
```

**Expected Output:**
```
test_parsers.py::test_parse_pdf PASSED
test_parsers.py::test_parse_docx PASSED
test_parsers.py::test_parse_txt PASSED
test_parsers.py::test_parse_document_router PASSED
```

---

## Test 2: Unit Test - Text Chunking

```python
# test_chunker.py
from app.rag.chunker import chunk_text, count_tokens

def test_count_tokens():
    """Test token counting approximation."""
    text = "This is a test sentence with ten words total here."
    tokens = count_tokens(text)
    
    # 10 words * 1.3 = 13 tokens
    assert tokens == 13
    print(f"✓ Token count: {tokens}")

def test_chunk_text_basic():
    """Test basic text chunking."""
    # Create text with known word count
    text = " ".join([f"word{i}" for i in range(1000)])  # 1000 words
    
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    
    assert len(chunks) > 0
    assert all("chunk_index" in chunk for chunk in chunks)
    assert all("text" in chunk for chunk in chunks)
    assert all("token_count" in chunk for chunk in chunks)
    
    print(f"✓ Created {len(chunks)} chunks from 1000 words")
    print(f"  First chunk: {chunks[0]['token_count']} tokens")
    print(f"  Last chunk: {chunks[-1]['token_count']} tokens")

def test_chunk_text_overlap():
    """Test that chunks overlap correctly."""
    text = " ".join([f"word{i}" for i in range(500)])
    
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    
    if len(chunks) >= 2:
        # Get last few words of first chunk
        chunk0_words = chunks[0]["text"].split()[-10:]
        # Get first few words of second chunk
        chunk1_words = chunks[1]["text"].split()[:10:]
        
        # Should have some overlap
        overlap_words = set(chunk0_words) & set(chunk1_words)
        assert len(overlap_words) > 0
        print(f"✓ Chunks overlap with {len(overlap_words)} shared words")

def test_chunk_text_empty():
    """Test chunking empty text."""
    chunks = chunk_text("")
    assert chunks == []
    print("✓ Empty text returns empty chunks")

def test_chunk_text_small():
    """Test chunking very small text."""
    text = "Just a few words here."
    chunks = chunk_text(text, chunk_size=100)
    
    assert len(chunks) == 1
    assert chunks[0]["text"] == text
    print("✓ Small text creates single chunk")
```

### Run Test
```bash
pytest tests/test_chunker.py -v
```

---

## Test 3: Unit Test - Embeddings

```python
# test_embeddings.py
from app.rag.embeddings import EmbeddingService, get_embedding_service, embedding_service

def test_embedding_service_init():
    """Test embedding service initialization."""
    service = EmbeddingService()
    
    assert service.model is not None
    assert service.embedding_dim == 384  # all-MiniLM-L6-v2 dimension
    print(f"✓ Model loaded, dimension: {service.embedding_dim}")

def test_embed_texts_batch():
    """Test batch embedding generation."""
    service = get_embedding_service()
    
    texts = [
        "This is the first test sentence.",
        "Here is another test sentence.",
        "And one more for good measure."
    ]
    
    embeddings = service.embed_texts(texts)
    
    assert len(embeddings) == 3
    assert all(len(emb) == 384 for emb in embeddings)
    assert all(isinstance(emb[0], float) for emb in embeddings)
    
    print(f"✓ Generated {len(embeddings)} embeddings")
    print(f"  Embedding sample: [{embeddings[0][0]:.4f}, {embeddings[0][1]:.4f}, ...]")

def test_embed_single():
    """Test single text embedding."""
    service = get_embedding_service()
    
    embedding = service.embed_single("This is a test.")
    
    assert len(embedding) == 384
    assert isinstance(embedding[0], float)
    print("✓ Single embedding generated")

def test_embedding_similarity():
    """Test that similar texts have similar embeddings."""
    import numpy as np
    
    service = get_embedding_service()
    
    texts = [
        "The cat sat on the mat.",
        "A cat is sitting on a mat.",
        "Dogs are running in the park."
    ]
    
    embeddings = service.embed_texts(texts)
    
    # Calculate cosine similarity
    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    
    sim_cat_cat = cosine_similarity(embeddings[0], embeddings[1])
    sim_cat_dog = cosine_similarity(embeddings[0], embeddings[2])
    
    # Similar sentences should have higher similarity
    assert sim_cat_cat > sim_cat_dog
    
    print(f"✓ Cat-cat similarity: {sim_cat_cat:.4f}")
    print(f"  Cat-dog similarity: {sim_cat_dog:.4f}")
    print("  Similar texts have higher similarity!")

def test_singleton():
    """Test that embedding_service is a singleton."""
    service1 = get_embedding_service()
    service2 = get_embedding_service()
    
    assert service1 is service2
    assert embedding_service is service1
    print("✓ Singleton pattern works")
```

### Run Test
```bash
pytest tests/test_embeddings.py -v
```

**Note:** First run will download the model (~80MB), subsequent runs will be faster.

---

## Test 4: Unit Test - ChromaDB Client

```python
# test_chromadb.py
import uuid
from app.infrastructure.chromadb_client import ChromaDBClient
from app.core.config import get_settings

def test_chromadb_connection():
    """Test ChromaDB connection."""
    settings = get_settings()
    client = ChromaDBClient(settings)
    client.connect()
    
    assert client.client is not None
    print("✓ ChromaDB connected")

def test_get_or_create_collection():
    """Test collection creation."""
    settings = get_settings()
    client = ChromaDBClient(settings)
    client.connect()
    
    course_id = uuid.uuid4()
    collection = client.get_or_create_collection(course_id)
    
    assert collection is not None
    assert collection.name == f"gradeai_{str(course_id)}"
    print(f"✓ Collection created: {collection.name}")
    
    # Get same collection again
    collection2 = client.get_or_create_collection(course_id)
    assert collection.name == collection2.name
    print("✓ Get existing collection works")

def test_add_and_query_chunks():
    """Test adding chunks and querying."""
    settings = get_settings()
    client = ChromaDBClient(settings)
    client.connect()
    
    course_id = uuid.uuid4()
    collection = client.get_or_create_collection(course_id)
    
    # Add test chunks
    chunks = [
        "The assignment requires students to implement a sorting algorithm.",
        "Students must write unit tests for their code.",
        "The rubric includes code quality and documentation."
    ]
    
    # Generate fake embeddings (in real case, use embedding_service)
    embeddings = [[0.1 * i] * 384 for i in range(len(chunks))]
    
    metadatas = [
        {"document_id": "doc1", "chunk_index": i, "doc_type": "rubric"}
        for i in range(len(chunks))
    ]
    
    ids = [str(uuid.uuid4()) for _ in range(len(chunks))]
    
    client.add_chunks(
        collection_name=collection.name,
        chunks=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )
    
    print(f"✓ Added {len(chunks)} chunks")
    
    # Query
    query_embedding = [0.15] * 384
    results = client.query(
        collection_name=collection.name,
        query_embedding=query_embedding,
        n_results=2
    )
    
    assert len(results) <= 2
    assert all("id" in r for r in results)
    assert all("document" in r for r in results)
    
    print(f"✓ Query returned {len(results)} results")
    print(f"  Top result: {results[0]['document'][:50]}...")

def test_delete_document_chunks():
    """Test deleting chunks by document_id."""
    settings = get_settings()
    client = ChromaDBClient(settings)
    client.connect()
    
    course_id = uuid.uuid4()
    collection = client.get_or_create_collection(course_id)
    
    doc_id = str(uuid.uuid4())
    
    # Add chunks
    client.add_chunks(
        collection_name=collection.name,
        chunks=["chunk1", "chunk2"],
        embeddings=[[0.1] * 384, [0.2] * 384],
        metadatas=[
            {"document_id": doc_id, "chunk_index": 0},
            {"document_id": doc_id, "chunk_index": 1}
        ],
        ids=[str(uuid.uuid4()), str(uuid.uuid4())]
    )
    
    print("✓ Added chunks")
    
    # Delete
    client.delete_document_chunks(collection.name, doc_id)
    print("✓ Deleted chunks")
    
    # Verify deletion
    results = client.query(
        collection_name=collection.name,
        query_embedding=[0.15] * 384,
        n_results=10,
        where_filter={"document_id": doc_id}
    )
    
    assert len(results) == 0
    print("✓ Chunks successfully deleted")
```

### Run Test
```bash
pytest tests/test_chromadb.py -v
```

---

## Test 5: Integration Test - Complete Pipeline

### Manual End-to-End Test

```bash
# Set environment variables
export TOKEN="your-jwt-token-here"
export COURSE_ID="course-uuid-here"

# Step 1: Upload a test PDF
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test_rubric.pdf",
    "content_type": "application/pdf",
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'"
  }' | jq '.'

# Save the upload_url and file_key from response
export UPLOAD_URL="..."
export FILE_KEY="..."

# Step 2: Upload file to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @test_rubric.pdf

# Step 3: Confirm upload (this triggers Celery task)
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "'$FILE_KEY'",
    "file_name": "test_rubric.pdf",
    "file_size_bytes": 123456,
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'"
  }' | jq '.'

# Save document_id from response
export DOCUMENT_ID="..."

# Step 4: Check status immediately
curl -X GET http://localhost:8000/api/v1/uploads/$DOCUMENT_ID/status \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Should show: "parse_status": "pending" or "processing"

# Step 5: Wait a few seconds, check again
sleep 5
curl -X GET http://localhost:8000/api/v1/uploads/$DOCUMENT_ID/status \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Should show: "parse_status": "success" and "chunk_count": 15
```

### Verify in Celery Logs

You should see:
```
[2026-06-09 12:00:00] Task gradeai.process_document[abc123] received
[2026-06-09 12:00:00] process_document_started document_id=abc123
[2026-06-09 12:00:01] document_loaded file_key=course-id/rubric/uuid_test.pdf
[2026-06-09 12:00:01] file_downloaded size_bytes=123456
[2026-06-09 12:00:02] text_extracted length=5432
[2026-06-09 12:00:02] text_chunked num_chunks=12
[2026-06-09 12:00:05] embeddings_generated count=12
[2026-06-09 12:00:05] chunks_stored_in_db count=12
[2026-06-09 12:00:06] chunks_stored_in_chromadb count=12
[2026-06-09 12:00:06] process_document_completed num_chunks=12
[2026-06-09 12:00:06] Task gradeai.process_document[abc123] succeeded
```

### Verify in Database

```sql
-- Check document status
SELECT id, file_name, parse_status, LENGTH(parsed_text) as text_length
FROM documents
WHERE id = 'document-uuid';

-- Should show: parse_status = 'success', text_length > 0

-- Check chunks
SELECT COUNT(*) as chunk_count
FROM document_chunks
WHERE document_id = 'document-uuid';

-- Should show: chunk_count = 12 (or whatever number was created)

-- Check chunk details
SELECT chunk_index, token_count, LENGTH(chunk_text) as text_length, embedding_id
FROM document_chunks
WHERE document_id = 'document-uuid'
ORDER BY chunk_index;
```

### Verify in ChromaDB

```python
from app.infrastructure.chromadb_client import ChromaDBClient
from app.core.config import get_settings

settings = get_settings()
client = ChromaDBClient(settings)
client.connect()

# List collections
collections = client.client.list_collections()
for col in collections:
    print(f"{col.name}: {col.count()} chunks")

# Query a specific course collection
course_id = "your-course-uuid"
collection_name = f"gradeai_{course_id}"

collection = client.client.get_collection(collection_name)
print(f"Collection {collection_name} has {collection.count()} chunks")

# Sample query
from app.rag.embeddings import embedding_service

query_text = "What is the rubric criteria?"
query_embedding = embedding_service.embed_single(query_text)

results = client.query(
    collection_name=collection_name,
    query_embedding=query_embedding,
    n_results=3
)

for i, result in enumerate(results, 1):
    print(f"\nResult {i}:")
    print(f"  Document: {result['document'][:100]}...")
    print(f"  Distance: {result['distance']}")
    print(f"  Metadata: {result['metadata']}")
```

---

## Test 6: Error Handling Tests

### Test 1: Unsupported File Type

```bash
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test.exe",
    "content_type": "application/x-msdownload",
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'"
  }'

# Expected: 400 Bad Request
# "Unsupported content type"
```

### Test 2: Corrupted PDF

Create a corrupted PDF file:
```bash
echo "This is not a valid PDF" > corrupted.pdf
```

Upload and confirm as usual. Check Celery logs:
```
parsing_failed error="Failed to parse PDF..."
process_document_failed attempt=1
retrying_document_processing countdown=30
```

After 3 retries, document should have `parse_status='failed'`.

### Test 3: Empty File

```bash
touch empty.txt
# Upload empty.txt
```

Expected behavior:
```
text_too_short document_id=...
document_status_updated status=failed
```

---

## Test 7: Performance Tests

### Test Large Document Processing

```python
# test_performance.py
import time
from app.tasks.grading import process_document

def test_large_document_performance():
    """Test processing time for large document."""
    # Upload a large PDF (50+ pages)
    document_id = "large-document-uuid"
    
    start_time = time.time()
    result = process_document.delay(document_id)
    result.get(timeout=120)  # Wait up to 2 minutes
    end_time = time.time()
    
    processing_time = end_time - start_time
    
    print(f"✓ Large document processed in {processing_time:.2f} seconds")
    assert processing_time < 120, "Processing took too long"
```

### Test Concurrent Processing

```bash
# Upload 10 documents concurrently
for i in {1..10}; do
    curl -X POST http://localhost:8000/api/v1/uploads/confirm \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{...}' &
done

wait

# Check Celery worker handles concurrent tasks
# Monitor: htop or celery flower
```

---

## 📊 Success Criteria

### All tests pass when:

- [x] **Parsers**
  - [ ] PDF parsing extracts text correctly
  - [ ] DOCX parsing extracts paragraphs and tables
  - [ ] TXT parsing handles encoding properly
  - [ ] Unsupported types raise ValueError

- [x] **Chunking**
  - [ ] Text splits into approximately correct token sizes
  - [ ] Chunks overlap as configured
  - [ ] Empty text returns empty list
  - [ ] Small text creates single chunk

- [x] **Embeddings**
  - [ ] Model loads successfully (384 dimensions)
  - [ ] Batch embedding generates correct number of vectors
  - [ ] Single embedding works
  - [ ] Similar texts have similar embeddings
  - [ ] Singleton pattern works

- [x] **ChromaDB**
  - [ ] Connection succeeds
  - [ ] Collection creation/retrieval works
  - [ ] Adding chunks succeeds
  - [ ] Querying returns relevant results
  - [ ] Deleting chunks works

- [x] **Complete Pipeline**
  - [ ] Document status changes: pending → processing → success
  - [ ] Chunks stored in database
  - [ ] Embeddings stored in ChromaDB
  - [ ] parsed_text field populated
  - [ ] Celery task completes successfully

- [x] **Error Handling**
  - [ ] Unsupported file types rejected
  - [ ] Corrupted files fail gracefully
  - [ ] Empty files fail with appropriate error
  - [ ] Retry logic works (3 retries with backoff)
  - [ ] Final status is 'failed' after max retries

- [x] **Performance**
  - [ ] Small documents (< 1MB) process in < 10s
  - [ ] Large documents (< 10MB) process in < 60s
  - [ ] Concurrent uploads handled correctly
  - [ ] No memory leaks

---

## 🐛 Troubleshooting

### Celery Task Not Starting

**Check:**
```bash
# Is Celery worker running?
ps aux | grep celery

# Is Redis accessible?
redis-cli ping

# Check Celery logs
celery -A app.celery_app worker --loglevel=debug
```

### Model Download Issues

**Check:**
```bash
# Sentence-transformers downloads models to cache
ls ~/.cache/huggingface/

# If blocked, manually download:
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

### ChromaDB Connection Failed

**Check:**
```bash
# Is ChromaDB running?
curl http://localhost:8001/api/v1/heartbeat

# Check docker container
docker ps | grep chroma

# Restart if needed
docker-compose restart chromadb
```

### Parsing Fails for Valid Files

**Check:**
```python
# Test parser directly
from app.rag.parsers import parse_pdf

with open("problem_file.pdf", "rb") as f:
    try:
        text = parse_pdf(f.read())
        print(text)
    except Exception as e:
        print(f"Error: {e}")
```

---

## ✅ Final Validation

Run all tests:
```bash
# Unit tests
pytest tests/test_parsers.py -v
pytest tests/test_chunker.py -v
pytest tests/test_embeddings.py -v
pytest tests/test_chromadb.py -v

# Integration test
pytest tests/test_integration_pipeline.py -v

# Or run all at once
pytest tests/ -v --cov=app
```

Check test coverage:
```bash
pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html
```

**Target:** > 80% coverage for new modules (parsers, chunker, embeddings)

---

## 🎉 Phase 3B Testing Complete!

When all tests pass, Phase 3B is validated and ready for production! 🚀

**Next:** Phase 4 - RAG-based grading and evaluation interface
