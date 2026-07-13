-- SQL queries to diagnose document processing issues
-- Run these in your PostgreSQL database

-- ============================================
-- Query 1: Recent Submission Documents
-- ============================================
-- Shows the last 10 submission documents with their processing status
SELECT 
    d.id,
    d.file_name,
    d.parse_status,
    d.mime_type,
    d.file_size_bytes,
    d.created_at,
    d.updated_at,
    CASE 
        WHEN d.parsed_text IS NULL THEN 'No text extracted'
        WHEN LENGTH(d.parsed_text) < 100 THEN 'Text too short (' || LENGTH(d.parsed_text) || ' chars)'
        ELSE LENGTH(d.parsed_text) || ' chars'
    END as text_status
FROM documents d
WHERE d.doc_type = 'submission'
ORDER BY d.created_at DESC
LIMIT 10;

-- ============================================
-- Query 2: Document Processing Status Summary
-- ============================================
-- Count documents by parse status
SELECT 
    parse_status,
    COUNT(*) as count,
    doc_type
FROM documents
GROUP BY parse_status, doc_type
ORDER BY doc_type, parse_status;

-- ============================================
-- Query 3: Recent Submissions and Their Documents
-- ============================================
-- Shows submissions with their associated document status
SELECT 
    s.id as submission_id,
    s.file_name as submission_file,
    s.status as submission_status,
    s.submitted_at,
    d.id as document_id,
    d.parse_status,
    COUNT(dc.id) as chunk_count
FROM submissions s
LEFT JOIN documents d ON 
    d.uploader_id = s.student_id AND 
    d.assignment_id = s.assignment_id AND 
    d.doc_type = 'submission'
LEFT JOIN document_chunks dc ON dc.document_id = d.id
GROUP BY s.id, s.file_name, s.status, s.submitted_at, d.id, d.parse_status
ORDER BY s.submitted_at DESC
LIMIT 10;

-- ============================================
-- Query 4: Failed Document Processing
-- ============================================
-- Shows documents that failed to process
SELECT 
    d.id,
    d.file_name,
    d.mime_type,
    d.file_key,
    d.file_size_bytes,
    d.parse_status,
    d.created_at,
    d.updated_at,
    EXTRACT(EPOCH FROM (d.updated_at - d.created_at)) as seconds_to_fail
FROM documents d
WHERE d.parse_status = 'failed'
ORDER BY d.created_at DESC;

-- ============================================
-- Query 5: Documents Stuck in Processing
-- ============================================
-- Shows documents that have been processing for more than 5 minutes
SELECT 
    d.id,
    d.file_name,
    d.mime_type,
    d.parse_status,
    d.created_at,
    d.updated_at,
    NOW() - d.created_at as time_elapsed
FROM documents d
WHERE d.parse_status IN ('pending', 'processing')
    AND d.created_at < NOW() - INTERVAL '5 minutes'
ORDER BY d.created_at DESC;

-- ============================================
-- Query 6: Successful Processing Statistics
-- ============================================
-- Average processing time for successful documents
SELECT 
    doc_type,
    COUNT(*) as total_processed,
    ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))) as avg_seconds,
    ROUND(MIN(EXTRACT(EPOCH FROM (updated_at - created_at)))) as min_seconds,
    ROUND(MAX(EXTRACT(EPOCH FROM (updated_at - created_at)))) as max_seconds
FROM documents
WHERE parse_status = 'success'
GROUP BY doc_type;

-- ============================================
-- Query 7: Evaluations Waiting for Document Processing
-- ============================================
-- Shows submissions that are being evaluated but document isn't ready
SELECT 
    s.id as submission_id,
    s.status as submission_status,
    d.id as document_id,
    d.file_name,
    d.parse_status,
    d.created_at as doc_created,
    NOW() - d.created_at as waiting_time
FROM submissions s
JOIN documents d ON 
    d.uploader_id = s.student_id AND 
    d.assignment_id = s.assignment_id AND 
    d.doc_type = 'submission'
WHERE s.status = 'evaluating'
    AND d.parse_status != 'success'
ORDER BY d.created_at DESC;

-- ============================================
-- Query 8: Document Chunks by Document
-- ============================================
-- Shows chunk count for each document
SELECT 
    d.id,
    d.file_name,
    d.parse_status,
    COUNT(dc.id) as chunk_count,
    ROUND(AVG(dc.token_count)) as avg_tokens_per_chunk
FROM documents d
LEFT JOIN document_chunks dc ON dc.document_id = d.id
GROUP BY d.id, d.file_name, d.parse_status
HAVING d.parse_status = 'success'
ORDER BY COUNT(dc.id) DESC
LIMIT 10;

-- ============================================
-- HOW TO RUN THESE QUERIES
-- ============================================
-- Option 1: From Docker
--   docker exec -it gradeai-postgres psql -U gradeai -d gradeai -f /path/to/this/file.sql
--
-- Option 2: Copy/paste individual queries into your SQL client
--
-- Option 3: From Docker interactive shell
--   docker exec -it gradeai-postgres psql -U gradeai -d gradeai
--   Then paste queries one by one
