# Phase 3B Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**First time?** This will download:
- Text processing libraries (~5MB)
- PyTorch CPU version (~80MB)
- Sentence transformers model (~80MB on first use)

Total download: ~165MB

### Step 2: Verify Infrastructure

```bash
# Check all services are running
make check-services

# Or manually:
psql -h localhost -U gradeai -d gradeai -c "SELECT 1;"  # PostgreSQL
redis-cli ping                                           # Redis
curl http://localhost:9000/minio/health/live            # MinIO
curl http://localhost:8001/api/v1/heartbeat             # ChromaDB
```

All should return success.

### Step 3: Start Celery Worker

```bash
# Terminal 1 - Celery Worker
cd backend
celery -A app.celery_app worker --loglevel=info
```

Look for:
```
[tasks]
  . gradeai.process_document  ← This is what we built!
  . gradeai.process_submission

celery@hostname ready.
```

### Step 4: Start Backend (if not already running)

```bash
# Terminal 2 - FastAPI
cd backend
uvicorn app.main:app --reload
```

API will be at: http://localhost:8000

### Step 5: Test It!

#### Option A: Use existing frontend

1. Start frontend: `cd frontend && npm run dev`
2. Login as professor
3. Go to course detail page
4. Upload a rubric PDF
5. Watch Celery logs process it in real-time!

#### Option B: Use API directly

```bash
# Set your token
export TOKEN="your-jwt-token"
export COURSE_ID="your-course-uuid"

# 1. Get presigned URL
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test.pdf",
    "content_type": "application/pdf",
    "doc_type": "notes",
    "course_id": "'$COURSE_ID'"
  }'

# Save: upload_url and file_key

# 2. Upload to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @test.pdf

# 3. Confirm (triggers processing!)
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "'$FILE_KEY'",
    "file_name": "test.pdf",
    "file_size_bytes": 123456,
    "doc_type": "notes",
    "course_id": "'$COURSE_ID'"
  }'

# Save: document_id

# 4. Check status (wait a few seconds)
curl http://localhost:8000/api/v1/uploads/$DOCUMENT_ID/status \
  -H "Authorization: Bearer $TOKEN"

# Should show:
# {
#   "id": "...",
#   "file_name": "test.pdf",
#   "parse_status": "success",  ← Changed from "pending"!
#   "chunk_count": 12           ← Chunks created!
# }
```

---

## 🎬 What Happens Behind the Scenes

```
You upload file
     ↓
FastAPI creates Document (status=PENDING)
     ↓
Triggers: process_document.delay(document_id)
     ↓
Celery Worker picks up task
     ↓
┌──────────────────────────────────────┐
│  1. Download from S3                 │
│  2. Parse PDF → Extract text         │
│  3. Split into chunks (~500 tokens)  │
│  4. Generate embeddings (384-dim)    │
│  5. Store chunks in PostgreSQL       │
│  6. Store embeddings in ChromaDB     │
│  7. Update status → SUCCESS          │
└──────────────────────────────────────┘
     ↓
Document ready for AI grading! ✨
```

---

## 📊 Verify It Worked

### In Celery Logs

Look for this sequence:
```
process_document_started document_id=abc-123
document_loaded file_key=course/notes/abc_test.pdf
file_downloaded size_bytes=123456
text_extracted length=5432
text_chunked num_chunks=12
embeddings_generated count=12
chunks_stored_in_db count=12
chunks_stored_in_chromadb count=12
process_document_completed num_chunks=12 ✓
Task succeeded in 5.2s
```

### In Database

```sql
-- Check document status
SELECT id, file_name, parse_status, LENGTH(parsed_text)
FROM documents
ORDER BY created_at DESC
LIMIT 5;

-- Should show: parse_status='success', parsed_text length > 0

-- Check chunks
SELECT d.file_name, COUNT(dc.id) as chunks
FROM documents d
LEFT JOIN document_chunks dc ON dc.document_id = d.id
GROUP BY d.id, d.file_name
ORDER BY d.created_at DESC
LIMIT 5;

-- Should show: chunks > 0
```

### In ChromaDB

```python
python3
>>> from app.infrastructure.chromadb_client import ChromaDBClient
>>> from app.core.config import get_settings
>>> 
>>> client = ChromaDBClient(get_settings())
>>> client.connect()
>>> 
>>> # List collections
>>> collections = client.client.list_collections()
>>> for col in collections:
...     print(f"{col.name}: {col.count()} embeddings")
...
gradeai_course-uuid: 12 embeddings
```

---

## 🔍 Quick Diagnostics

### Problem: "No module named 'pdfplumber'"

**Solution:**
```bash
cd backend
pip install -r requirements.txt
```

### Problem: "Celery worker not receiving tasks"

**Check:**
```bash
# Is worker running?
ps aux | grep celery

# Is Redis accessible?
redis-cli ping  # Should return PONG

# Restart worker
celery -A app.celery_app worker --loglevel=info
```

### Problem: "parse_status stuck on PENDING"

**Causes:**
1. Celery worker not running → Start it
2. Task failed silently → Check Celery logs
3. Redis connection issue → Check Redis

**Check task status:**
```python
from app.celery_app import celery_app
result = celery_app.AsyncResult('task-id-here')
print(result.state)  # PENDING, PROCESSING, SUCCESS, FAILURE
print(result.info)   # Error info if failed
```

### Problem: "ChromaDB connection refused"

**Solution:**
```bash
# Start ChromaDB
docker run -p 8001:8000 chromadb/chroma:latest

# Or use docker-compose
docker-compose up chromadb
```

### Problem: "Out of memory"

**Cause:** Processing very large files

**Solutions:**
1. Increase chunk size (fewer chunks, less memory):
   ```python
   chunks = chunk_text(text, chunk_size=1000, overlap=100)
   ```

2. Add more Celery workers (distribute load)

3. Process in batches (modify task to process chunks incrementally)

---

## 📚 Learn More

- **Full Documentation**: See `PHASE3B_IMPLEMENTATION.md`
- **Testing Guide**: See `PHASE3B_TESTING.md`
- **Summary**: See `PHASE3B_SUMMARY.md`
- **API Docs**: http://localhost:8000/docs

---

## 🎯 What You Can Do Now

### 1. Upload Any Supported File
- PDF documents
- Word documents (.docx)
- Plain text files

### 2. Automatic Processing
- Text extraction
- Semantic chunking
- Embedding generation
- Vector storage

### 3. Query Documents (Coming in Phase 4)
```python
# This will work once Phase 4 is implemented
from app.rag.embeddings import embedding_service
from app.infrastructure.chromadb_client import ChromaDBClient

# Search for relevant content
query = "What are the rubric criteria?"
query_embedding = embedding_service.embed_single(query)

results = client.query(
    collection_name=f"gradeai_{course_id}",
    query_embedding=query_embedding,
    n_results=5
)

for result in results:
    print(result['document'])  # Relevant text chunks
```

---

## 🚀 Next Steps

### Phase 4 Preview

With documents now processed and searchable, we can build:

1. **RAG-Based AI Grading**
   ```python
   # Pseudocode for Phase 4
   rubric = get_rubric_chunks(assignment_id)
   submission = get_submission_chunks(submission_id)
   
   context = query_chromadb(rubric + submission)
   
   grade = llm.generate(
       f"Grade this submission using this rubric: {context}"
   )
   ```

2. **Intelligent Feedback**
   - Point to specific submission sections
   - Reference rubric criteria
   - Provide examples from notes/solutions

3. **Similarity Detection**
   - Compare submissions
   - Find plagiarism patterns
   - Identify common mistakes

---

## ✅ Phase 3B is Ready!

You now have:
- ✅ Text extraction from PDF/DOCX/TXT
- ✅ Semantic chunking with overlap
- ✅ Local embedding generation (no API costs!)
- ✅ Vector storage in ChromaDB
- ✅ Automatic processing via Celery
- ✅ Full error handling and retry logic

**Time to build AI-powered grading in Phase 4!** 🎓✨

---

## 💡 Pro Tips

### Tip 1: Monitor Processing

```bash
# Watch Celery logs in real-time
celery -A app.celery_app worker --loglevel=info | grep process_document
```

### Tip 2: Test Locally First

```python
# Test parsing without Celery
from app.rag.parsers import parse_pdf

with open("test.pdf", "rb") as f:
    text = parse_pdf(f.read())
    print(f"Extracted {len(text)} characters")
```

### Tip 3: Use Flower for Monitoring

```bash
# Install Flower
pip install flower

# Start Flower web UI
celery -A app.celery_app flower

# Open: http://localhost:5555
```

### Tip 4: Batch Upload for Testing

```bash
# Upload multiple files at once
for file in *.pdf; do
    # Upload and confirm
    echo "Processing $file..."
done
```

---

**Happy Processing! 🚀**
