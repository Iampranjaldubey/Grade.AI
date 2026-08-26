# Document Processing Failure Diagnosis

## Issue Summary

The Celery logs show evaluation tasks failing with:
```
evaluate_submission_failed: Document parsing failed. Cannot evaluate.
```

This is **expected behavior** when document processing hasn't completed yet. The evaluation task is correctly retrying every 60 seconds (up to 5 times) while waiting for the document to be processed.

## Understanding the Flow

### Normal Document Processing Pipeline

1. **Student uploads file** → Document created with `parse_status = PENDING`
2. **Upload confirmation** → Triggers `process_document` Celery task
3. **Document processing** (async):
   - Downloads file from MinIO
   - Extracts text based on MIME type (PDF/DOCX/TXT)
   - Chunks text into smaller pieces
   - Generates embeddings for each chunk
   - Stores chunks in PostgreSQL
   - Stores embeddings in ChromaDB
   - Updates `parse_status = SUCCESS`
4. **Professor triggers evaluation** → `evaluate_submission` task starts
5. **Evaluation checks document status**:
   - If `parse_status != SUCCESS` → Retry after 60s
   - If `parse_status == FAILED` → Raise error immediately
   - If `parse_status == SUCCESS` → Proceed with evaluation

### What the Logs Show

From your logs:
```python
# Line: 2026-07-05 17:35:19 [error] evaluate_submission_failed
# error=Document parsing failed. Cannot evaluate.
# attempt=1

# Line: 2026-07-05 17:35:19 [info] retrying_evaluation countdown=60
```

This means:
- Document is still in `PENDING` or `PROCESSING` state (not yet `SUCCESS`)
- Evaluation correctly retries after 60 seconds
- This will continue for up to 5 retries (5 minutes total)

## Root Causes to Investigate

### 1. **Is `process_document` Task Running?**

The `process_document` task should have started immediately after upload confirmation. Check if you see these logs:

```
process_document_started document_id=...
document_loaded document_id=... file_key=... mime_type=...
file_downloaded document_id=... size_bytes=...
text_extracted document_id=... length=...
text_chunked document_id=... num_chunks=...
embeddings_generated document_id=... count=...
chunks_stored_in_db document_id=... count=...
chunks_stored_in_chromadb document_id=... count=...
process_document_completed document_id=... num_chunks=...
```

**If you DON'T see these logs**, the task is not being picked up by Celery workers.

### 2. **Is Celery Worker Running?**

Check if the `celery-worker` container is running:

```bash
docker ps | grep celery
```

Check Celery worker logs:

```bash
docker logs gradeai-celery -f
```

You should see:
```
[INFO/MainProcess] Connected to redis://redis:6379/0
[INFO/MainProcess] mingle: searching for neighbors
[INFO/MainProcess] mingle: all alone
[INFO/MainProcess] celery@<hostname> ready.
```

### 3. **MinIO CORS Configuration**

If the file upload failed or is incomplete, document processing will fail. Verify:

1. File actually uploaded to MinIO (check MinIO Console at http://localhost:9001)
2. MinIO CORS is configured (see `MINIO_QUICK_FIX.md`)

### 4. **Document Processing Errors**

If `process_document` starts but fails, check for these errors:

**Text Extraction Errors:**
```python
parsing_failed document_id=... error=...
text_too_short document_id=...
```

**S3 Download Errors:**
```python
s3_download_failed file_key=... error=...
```

**ChromaDB Errors:**
```python
# ChromaDB connection or storage errors
```

### 5. **Missing Dependencies**

The document processing pipeline requires:
- **pdfplumber** (PDF parsing)
- **python-docx** (DOCX parsing)
- **chromadb-client** (vector storage)
- **boto3** (S3/MinIO access)

Check if these are installed in the Celery worker container.

## Diagnostic Steps

### Step 1: Check Celery Worker Status

```bash
# Check if container is running
docker ps | grep celery

# Check worker logs
docker logs gradeai-celery --tail=100 -f
```

### Step 2: Check Document Status in Database

Query the database to see document parse_status:

```sql
SELECT 
    id, 
    file_name, 
    parse_status, 
    mime_type, 
    created_at,
    updated_at
FROM documents 
WHERE doc_type = 'submission'
ORDER BY created_at DESC 
LIMIT 5;
```

Expected values:
- `PENDING` → Task not started yet
- `PROCESSING` → Task in progress
- `SUCCESS` → Processing complete
- `FAILED` → Processing failed

### Step 3: Check MinIO File Storage

1. Open MinIO Console: http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Navigate to bucket: `gradeai-files`
4. Verify files exist under: `{course_id}/submission/{file_name}`

### Step 4: Manual Task Trigger (Testing)

Connect to backend container and manually trigger a task:

```bash
# Enter backend container
docker exec -it gradeai-backend bash

# Open Python shell
python

# Trigger task manually
from app.tasks.grading import process_document
result = process_document.delay("your-document-id-here")
print(f"Task ID: {result.id}")
print(f"Task Status: {result.status}")
```

### Step 5: Check Celery Task Queue

```bash
# Enter Redis container
docker exec -it gradeai-redis redis-cli

# Check queue length
LLEN celery

# Inspect tasks (first 10)
LRANGE celery 0 9

# Check for any failed tasks
KEYS celery-task-meta-*
```

## Common Issues and Solutions

### Issue 1: Celery Worker Not Starting

**Symptoms:**
- `docker ps` shows container exited
- No worker logs

**Solutions:**
```bash
# Check worker container logs
docker logs gradeai-celery

# Restart worker
docker-compose restart celery-worker

# Rebuild if needed
docker-compose build celery-worker
docker-compose up -d celery-worker
```

### Issue 2: Task Queue Not Connected

**Symptoms:**
- Worker running but not picking up tasks
- No "task received" logs

**Check:**
```bash
# Verify Redis connection
docker exec -it gradeai-backend bash
python -c "import redis; r = redis.from_url('redis://redis:6379/0'); print(r.ping())"
```

**Solutions:**
- Check `CELERY_BROKER_URL` in `.env` file
- Ensure Redis container is running
- Restart worker after fixing connection

### Issue 3: MinIO File Not Found

**Symptoms:**
```
s3_download_failed file_key=... error=NoSuchKey
```

**Solutions:**
1. Check CORS configuration (see `MINIO_QUICK_FIX.md`)
2. Verify upload completed successfully
3. Check `file_key` value in Document record matches actual S3 path

### Issue 4: Text Extraction Failed

**Symptoms:**
```
parsing_failed document_id=... error=Failed to parse PDF
text_too_short document_id=...
```

**Solutions:**
- Verify file is valid (not corrupted)
- Check MIME type matches actual file type
- For PDFs: Some PDFs are image-based (no extractable text)
- Try uploading a simple text file first to test pipeline

### Issue 5: ChromaDB Connection Failed

**Symptoms:**
- Task hangs or fails during embedding storage
- No "chunks_stored_in_chromadb" log

**Solutions:**
```bash
# Check ChromaDB health
curl http://localhost:8001/api/v1/heartbeat

# Check ChromaDB logs
docker logs gradeai-chromadb

# Restart ChromaDB
docker-compose restart chromadb
```

## Frontend Improvements Needed

Based on this analysis, the frontend should provide better feedback:

### 1. **Document Processing Status Display**

Show real-time status on submission page:

```typescript
// Poll document status after upload
const pollDocumentStatus = async (documentId: string) => {
  const interval = setInterval(async () => {
    const status = await api.getDocumentStatus(documentId);
    
    if (status.parse_status === 'success') {
      clearInterval(interval);
      // Show "Ready for evaluation" message
    } else if (status.parse_status === 'failed') {
      clearInterval(interval);
      // Show error message
    }
    // Keep polling if 'pending' or 'processing'
  }, 3000); // Every 3 seconds
};
```

### 2. **Prevent Early Evaluation**

Don't allow professor to trigger evaluation until document is ready:

```typescript
const canEvaluate = submission.status === 'submitted' 
  && documentStatus?.parse_status === 'success';

<Button disabled={!canEvaluate}>
  {documentStatus?.parse_status === 'processing' 
    ? 'Processing document...' 
    : 'Evaluate Submission'}
</Button>
```

### 3. **Show Processing Progress**

```typescript
// Show progress indicator
{documentStatus?.parse_status === 'pending' && (
  <div>⏳ Waiting to process document...</div>
)}

{documentStatus?.parse_status === 'processing' && (
  <div>⚙️ Processing document (extracting text, generating embeddings)...</div>
)}

{documentStatus?.parse_status === 'success' && (
  <div>✅ Document ready ({documentStatus.chunk_count} chunks created)</div>
)}

{documentStatus?.parse_status === 'failed' && (
  <div>❌ Document processing failed. Please re-upload.</div>
)}
```

## Quick Fix Checklist

Run through these checks in order:

- [ ] **Step 1:** Check if Celery worker container is running: `docker ps | grep celery`
- [ ] **Step 2:** Check Celery logs: `docker logs gradeai-celery --tail=50`
- [ ] **Step 3:** Check if MinIO CORS is configured (see `MINIO_QUICK_FIX.md`)
- [ ] **Step 4:** Query document `parse_status` in database
- [ ] **Step 5:** Check MinIO Console - verify file exists
- [ ] **Step 6:** Look for `process_document` logs in Celery output
- [ ] **Step 7:** Check for parsing errors in Celery logs
- [ ] **Step 8:** Verify ChromaDB is running: `docker ps | grep chroma`

## Next Steps

**Please provide:**
1. Celery worker logs: `docker logs gradeai-celery --tail=100`
2. Document parse_status from database query above
3. Confirmation that MinIO CORS is configured

This will help identify the exact bottleneck in the document processing pipeline.
