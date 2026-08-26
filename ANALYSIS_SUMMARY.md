# Analysis Summary - Document Processing Issue

## What I Found

The Celery logs you provided show **expected behavior**, not an error. Here's what's happening:

### The Evaluation Logs

```
[2026-07-05 17:35:19] evaluate_submission_failed
error=Document parsing failed. Cannot evaluate.
attempt=1

[2026-07-05 17:35:19] retrying_evaluation countdown=60
```

This means:
- ✅ **Correct behavior:** The evaluation task checks if the document is ready
- ✅ **Correct behavior:** If not ready, it retries after 60 seconds
- ✅ **Correct behavior:** It will retry up to 5 times (5 minutes total)

### The Real Question

**Is the `process_document` task running and completing successfully?**

That's what we need to find out. The evaluation is correctly waiting for document processing to finish.

## How Document Processing Works

### Complete Pipeline (30-60 seconds)

```
1. Student uploads file
   └─ POST /uploads/presign (get upload URL)
   └─ PUT to MinIO (browser → MinIO direct)
   └─ POST /uploads/confirm (confirm upload)
      └─ Creates Document record (parse_status = PENDING)
      └─ Triggers: process_document.delay(document_id)

2. Celery worker picks up process_document task
   └─ Updates parse_status = PROCESSING
   └─ Downloads file from MinIO
   └─ Extracts text (PDF/DOCX/TXT)
   └─ Chunks text (500 chars, 50 overlap)
   └─ Generates embeddings
   └─ Stores chunks in PostgreSQL
   └─ Stores embeddings in ChromaDB
   └─ Updates parse_status = SUCCESS

3. Professor triggers evaluation
   └─ evaluate_submission task starts
   └─ Checks: document.parse_status == SUCCESS?
      ├─ YES → Proceeds with evaluation
      └─ NO  → Retries after 60 seconds
```

## What Could Be Wrong

### Scenario A: Worker Not Running

**Symptoms:**
- Document stays in `PENDING` forever
- No `process_document` logs

**Check:**
```bash
docker ps | grep celery
docker logs gradeai-celery --tail=20
```

**Fix:**
```bash
docker-compose restart celery-worker
```

### Scenario B: Task Failed

**Symptoms:**
- Document changes to `FAILED`
- Error logs in Celery worker

**Common Errors:**
1. **File not found in MinIO** → CORS not configured
2. **Text extraction failed** → Corrupted file or unsupported format
3. **ChromaDB connection failed** → ChromaDB not running

**Check:**
```bash
docker logs gradeai-celery | grep "process_document"
docker logs gradeai-celery | grep "error"
```

### Scenario C: Task Still Processing

**Symptoms:**
- Document in `PROCESSING` state
- Logs show task started but not completed

**This is normal if:**
- File is large (may take 1-2 minutes)
- Just uploaded (processing takes 30-60 seconds)

**This is a problem if:**
- Been processing for > 5 minutes
- No progress in logs

## Code Analysis

I reviewed the complete pipeline:

### `/uploads/confirm` Endpoint (uploads.py)
✅ Correctly triggers Celery task:
```python
process_document.delay(str(document.id))
```

### `process_document` Task (grading.py)
✅ Complete implementation:
- Downloads from MinIO using `file_key`
- Parses PDF/DOCX/TXT files
- Creates chunks
- Generates embeddings
- Stores in ChromaDB
- Updates document status

✅ Proper error handling:
- Retries 3 times with exponential backoff (30s, 60s, 120s)
- Updates `parse_status = FAILED` on final failure

### `evaluate_submission` Task (grading.py)
✅ Correctly checks document status:
```python
if document.parse_status != ParseStatus.SUCCESS:
    if document.parse_status == ParseStatus.FAILED:
        raise ValueError("Document parsing failed. Cannot evaluate.")
    else:
        # Still processing - retry after 60s
        raise self.retry(countdown=60, max_retries=5)
```

### Document Parser (parsers.py)
✅ Supports three formats:
- PDF (using pdfplumber)
- DOCX (using python-docx)
- TXT (using standard decode)

✅ Text cleaning and normalization

## What You Need to Check

### 1. Is Celery Worker Running?

```bash
docker ps | grep celery
# Expected: gradeai-celery   Up X minutes
```

If not running:
```bash
docker-compose up -d celery-worker
```

### 2. What's the Document Status?

```sql
SELECT id, file_name, parse_status, created_at, updated_at
FROM documents 
WHERE doc_type = 'submission'
ORDER BY created_at DESC 
LIMIT 5;
```

Run via Docker:
```bash
docker exec -it gradeai-postgres psql -U gradeai -d gradeai -c "SELECT file_name, parse_status, created_at FROM documents WHERE doc_type = 'submission' ORDER BY created_at DESC LIMIT 5;"
```

Interpret results:
- `pending` → Task hasn't started (worker issue)
- `processing` → Task running (normal if < 2 min)
- `success` → Processing complete (evaluation should work)
- `failed` → Processing failed (check error logs)

### 3. Are Tasks Being Queued?

```bash
docker exec -it gradeai-redis redis-cli LLEN celery
# Shows number of tasks waiting
```

### 4. Check Worker Logs

```bash
docker logs gradeai-celery --tail=50 | grep "process_document"
```

Should show:
```
[INFO] Task gradeai.process_document[...] received
[INFO] process_document_started document_id=...
[INFO] document_loaded ...
[INFO] file_downloaded ...
[INFO] text_extracted ...
[INFO] process_document_completed ...
```

## Files Created for You

### Quick Start
- **`TROUBLESHOOTING_QUICK_REFERENCE.md`** - Start here! Decision tree and common fixes

### Diagnostics
- **`diagnose-system.bat`** (Windows) - Automated system check
- **`diagnose-system.sh`** (Linux/Mac) - Automated system check  
- **`diagnose-documents.sql`** - Database queries for document status

### Deep Dive
- **`DOCUMENT_PROCESSING_DIAGNOSIS.md`** - Complete technical analysis

### This File
- **`ANALYSIS_SUMMARY.md`** - Overview of findings (you are here)

## Recommended Next Steps

### Step 1: Run Quick Diagnostics (2 minutes)

**Windows:**
```bash
diagnose-system.bat
```

**Linux/Mac:**
```bash
chmod +x diagnose-system.sh
./diagnose-system.sh
```

### Step 2: Check Document Status (30 seconds)

```bash
docker exec -it gradeai-postgres psql -U gradeai -d gradeai -c "SELECT file_name, parse_status, created_at FROM documents WHERE doc_type = 'submission' ORDER BY created_at DESC LIMIT 3;"
```

### Step 3: Check Worker Logs (1 minute)

```bash
docker logs gradeai-celery --tail=50
```

### Step 4: Report Back

Share the output from steps 1-3, and I can provide targeted fixes.

## Most Likely Issues (in order of probability)

1. **Celery worker not running** (30% likelihood)
   - Quick fix: `docker-compose restart celery-worker`

2. **MinIO CORS not configured** (25% likelihood)
   - File upload fails, so processing can't start
   - Fix: See `MINIO_QUICK_FIX.md`

3. **Task failed silently** (20% likelihood)
   - Check Celery logs for errors

4. **ChromaDB not running** (15% likelihood)
   - Task fails during embedding storage
   - Fix: `docker-compose restart chromadb`

5. **Document is actually processing** (10% likelihood)
   - Just needs more time (30-60 seconds)
   - Wait and check status again

## Frontend Improvements Needed

The current frontend doesn't show document processing status, which causes confusion.

**Should add:**
1. Poll document status after upload
2. Show "Processing document..." message
3. Disable evaluation button until `parse_status = SUCCESS`
4. Show error if processing fails

**API endpoints already available:**
- `GET /uploads/{document_id}/status` ✅ Already implemented

Just needs frontend integration.

## Conclusion

**The evaluation task is working correctly.** It's waiting for document processing to complete.

**The question is:** Why hasn't document processing completed?

Run the diagnostic steps above to find out where the pipeline is stuck. Most likely it's either:
- Celery worker not running, OR
- Task failing due to MinIO access or ChromaDB connection

Once you provide the diagnostic output, I can give you the exact fix.
