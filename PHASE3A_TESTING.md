# Phase 3A Testing Guide - File Upload + Document Management

## 🚀 Prerequisites

### Infrastructure Running
```bash
# Check MinIO (S3)
curl http://localhost:9000/minio/health/live
# Should return: OK

# Check Redis
redis-cli ping
# Should return: PONG

# Check PostgreSQL
psql -h localhost -U gradeai -d gradeai -c "SELECT 1;"
# Should return: 1

# Check Backend API
curl http://localhost:8000/api/v1/health
# Should return: {"status":"healthy",...}

# Check Celery Worker
# Look for running process: celery -A app.celery_app worker
```

### Database Tables
Ensure these tables exist:
- `documents`
- `document_chunks`
- `submissions`
- `courses`
- `assignments`
- `enrollments`

## 📝 Test Scenario 1: Professor Uploads Rubric

### Step 1: Login as Professor
```bash
# Register/Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "prof@test.edu",
    "password": "password123"
  }'

# Save the access_token from response
export PROF_TOKEN="eyJ..."
```

### Step 2: Create a Course (if needed)
```bash
curl -X POST http://localhost:8000/api/v1/courses \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "Test Course",
    "course_code": "TEST101",
    "semester": "Fall 2026"
  }'

# Save course_id from response
export COURSE_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

### Step 3: Create an Assignment (if needed)
```bash
curl -X POST http://localhost:8000/api/v1/assignments \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "'$COURSE_ID'",
    "title": "Assignment 1",
    "due_date": "2026-12-31T23:59:59Z",
    "max_score": "100",
    "grading_mode": "auto"
  }'

# Save assignment_id
export ASSIGNMENT_ID="1a2b3c4d-5e6f-7890-1234-567890abcdef"
```

### Step 4: Request Presigned Upload URL
```bash
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test_rubric.pdf",
    "content_type": "application/pdf",
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'",
    "assignment_id": "'$ASSIGNMENT_ID'"
  }'
```

**Expected Response:**
```json
{
  "upload_url": "http://minio:9000/gradeai-files/...",
  "file_key": "a1b2c3d4.../rubric/uuid_test_rubric.pdf",
  "expires_in": 3600
}
```

**Verify:**
- ✅ Status code: 200
- ✅ upload_url contains MinIO endpoint
- ✅ file_key follows format: `{course_id}/{doc_type}/{uuid}_{filename}`
- ✅ expires_in is 3600 (1 hour)

```bash
# Save values
export UPLOAD_URL="..."
export FILE_KEY="..."
```

### Step 5: Upload File to S3
```bash
# Create a test PDF file if needed
echo "%PDF-1.4 Test Content" > test_rubric.pdf

# Upload to S3 using presigned URL
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @test_rubric.pdf
```

**Expected Response:**
- ✅ Status code: 200 or 204
- ✅ No error message

**Verify in MinIO:**
```bash
# If using MinIO client (mc)
mc ls myminio/gradeai-files/$COURSE_ID/rubric/
```

### Step 6: Confirm Upload
```bash
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "'$FILE_KEY'",
    "file_name": "test_rubric.pdf",
    "file_size_bytes": 1024,
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'",
    "assignment_id": "'$ASSIGNMENT_ID'"
  }'
```

**Expected Response:**
```json
{
  "id": "doc-uuid",
  "course_id": "a1b2c3d4...",
  "assignment_id": "1a2b3c4d...",
  "uploader_id": "prof-uuid",
  "doc_type": "rubric",
  "file_name": "test_rubric.pdf",
  "file_url": "http://minio:9000/...",
  "mime_type": "application/pdf",
  "file_size_bytes": 1024,
  "parse_status": "pending",
  "created_at": "2026-06-09T..."
}
```

**Verify:**
- ✅ Status code: 201
- ✅ Document record created
- ✅ parse_status is "pending"
- ✅ file_url is a presigned download URL

```bash
# Save document_id
export DOCUMENT_ID="doc-uuid"
```

### Step 7: Check Document Status
```bash
curl -X GET http://localhost:8000/api/v1/uploads/$DOCUMENT_ID/status \
  -H "Authorization: Bearer $PROF_TOKEN"
```

**Expected Response:**
```json
{
  "id": "doc-uuid",
  "file_name": "test_rubric.pdf",
  "parse_status": "pending",
  "chunk_count": 0
}
```

**Verify:**
- ✅ Status code: 200
- ✅ parse_status is "pending" (or "success" if Celery processed it)
- ✅ chunk_count is 0 (will be >0 after Phase 3B processing)

### Step 8: List Course Documents
```bash
curl -X GET http://localhost:8000/api/v1/uploads/courses/$COURSE_ID/documents \
  -H "Authorization: Bearer $PROF_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "doc-uuid",
    "course_id": "a1b2c3d4...",
    "doc_type": "rubric",
    "file_name": "test_rubric.pdf",
    ...
  }
]
```

**Verify:**
- ✅ Status code: 200
- ✅ Array contains uploaded document
- ✅ Documents grouped by doc_type

---

## 📝 Test Scenario 2: Student Submits Assignment

### Step 1: Login as Student
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.edu",
    "password": "password123"
  }'

export STUDENT_TOKEN="eyJ..."
```

### Step 2: Join Course
```bash
# Get join code from professor's course (from Step 2 above)
curl -X POST http://localhost:8000/api/v1/enrollments/join \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "join_code": "ABC123"
  }'
```

### Step 3: Request Presigned URL for Submission
```bash
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "my_submission.pdf",
    "content_type": "application/pdf",
    "doc_type": "submission",
    "course_id": "'$COURSE_ID'",
    "assignment_id": "'$ASSIGNMENT_ID'"
  }'

export UPLOAD_URL="..."
export FILE_KEY="..."
```

**Verify:**
- ✅ Student can request upload URL for enrolled course
- ✅ file_key contains "submission" doc_type

### Step 4: Upload File
```bash
echo "%PDF-1.4 Student Submission" > my_submission.pdf

curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @my_submission.pdf
```

### Step 5: Submit Assignment
```bash
curl -X POST http://localhost:8000/api/v1/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "'$ASSIGNMENT_ID'",
    "file_name": "my_submission.pdf",
    "file_key": "'$FILE_KEY'",
    "file_size_bytes": 2048
  }'
```

**Expected Response:**
```json
{
  "id": "submission-uuid",
  "assignment_id": "1a2b3c4d...",
  "student_id": "student-uuid",
  "file_url": "http://minio:9000/...",
  "file_name": "my_submission.pdf",
  "submitted_at": "2026-06-09T...",
  "status": "submitted"
}
```

**Verify:**
- ✅ Status code: 201
- ✅ Submission record created
- ✅ status is "submitted" (or "late" if past due date)
- ✅ Document record also created with doc_type="submission"

```bash
export SUBMISSION_ID="submission-uuid"
```

### Step 6: Get My Submission
```bash
curl -X GET http://localhost:8000/api/v1/submissions/$ASSIGNMENT_ID/my-submission \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

**Expected Response:**
```json
{
  "id": "submission-uuid",
  "assignment_id": "1a2b3c4d...",
  "student_id": "student-uuid",
  "file_url": "http://minio:9000/...",
  "file_name": "my_submission.pdf",
  "submitted_at": "2026-06-09T...",
  "status": "submitted"
}
```

**Verify:**
- ✅ Status code: 200
- ✅ Returns student's own submission

### Step 7: Resubmit Assignment
```bash
# Request new presigned URL
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "my_submission_v2.pdf",
    "content_type": "application/pdf",
    "doc_type": "submission",
    "course_id": "'$COURSE_ID'",
    "assignment_id": "'$ASSIGNMENT_ID'"
  }'

# Upload new file
export UPLOAD_URL="..."
export FILE_KEY="..."
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @my_submission_v2.pdf

# Resubmit
curl -X POST http://localhost:8000/api/v1/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "'$ASSIGNMENT_ID'",
    "file_name": "my_submission_v2.pdf",
    "file_key": "'$FILE_KEY'",
    "file_size_bytes": 3072
  }'
```

**Verify:**
- ✅ Returns same submission_id (existing record updated)
- ✅ submitted_at timestamp updated
- ✅ file_url and file_name updated

---

## 📝 Test Scenario 3: Professor Views Submissions

### Step 1: Get All Submissions
```bash
curl -X GET http://localhost:8000/api/v1/submissions/$ASSIGNMENT_ID/all \
  -H "Authorization: Bearer $PROF_TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": "submission-uuid",
    "assignment_id": "1a2b3c4d...",
    "student_id": "student-uuid",
    "file_url": "http://minio:9000/...",
    "file_name": "my_submission_v2.pdf",
    "submitted_at": "2026-06-09T...",
    "status": "submitted",
    "student_name": "John Student",
    "student_email": "student@test.edu",
    "has_evaluation": false
  }
]
```

**Verify:**
- ✅ Status code: 200
- ✅ Returns all submissions for assignment
- ✅ Includes student_name and student_email
- ✅ has_evaluation indicates if graded

---

## 📝 Test Scenario 4: Error Cases

### Test 1: Invalid Content Type
```bash
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test.exe",
    "content_type": "application/x-msdownload",
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'"
  }'
```

**Expected:**
- ✅ Status code: 400
- ✅ Error message about allowed content types

### Test 2: Unauthorized Course Access
```bash
# Create a new course as professor
# Try to upload as different professor/student not enrolled

curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "test.pdf",
    "content_type": "application/pdf",
    "doc_type": "rubric",
    "course_id": "non-existent-course-id"
  }'
```

**Expected:**
- ✅ Status code: 403 or 404
- ✅ Error message about access denied

### Test 3: Confirm Without Upload
```bash
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "fake-key-not-uploaded.pdf",
    "file_name": "test.pdf",
    "file_size_bytes": 1024,
    "doc_type": "rubric",
    "course_id": "'$COURSE_ID'"
  }'
```

**Expected:**
- ✅ Status code: 404
- ✅ Error: "File not found in storage"

### Test 4: Student Submit to Non-Enrolled Course
```bash
# Register new student, don't enroll
curl -X POST http://localhost:8000/api/v1/submissions \
  -H "Authorization: Bearer $NEW_STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "'$ASSIGNMENT_ID'",
    "file_name": "test.pdf",
    "file_key": "some-key",
    "file_size_bytes": 1024
  }'
```

**Expected:**
- ✅ Status code: 403
- ✅ Error: "You are not enrolled in this course"

### Test 5: Student Delete Document
```bash
curl -X DELETE http://localhost:8000/api/v1/uploads/$DOCUMENT_ID \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

**Expected:**
- ✅ Status code: 403
- ✅ Error: "Only the course professor can delete documents"

---

## 📝 Test Scenario 5: Document Management

### Test 1: Delete Document (Professor)
```bash
curl -X DELETE http://localhost:8000/api/v1/uploads/$DOCUMENT_ID \
  -H "Authorization: Bearer $PROF_TOKEN"
```

**Expected:**
- ✅ Status code: 204
- ✅ No response body

**Verify:**
- ✅ Document deleted from database
- ✅ File deleted from MinIO
- ✅ Document chunks deleted (if any)

### Test 2: Verify Deletion
```bash
# Try to get deleted document status
curl -X GET http://localhost:8000/api/v1/uploads/$DOCUMENT_ID/status \
  -H "Authorization: Bearer $PROF_TOKEN"
```

**Expected:**
- ✅ Status code: 404
- ✅ Error: "Document not found"

---

## 🧪 Automated Test Script

Create a file `test_phase3a.sh`:

```bash
#!/bin/bash
set -e

echo "=== Phase 3A Testing ==="

# Configuration
API_URL="http://localhost:8000/api/v1"
PROF_EMAIL="prof@test.edu"
PROF_PASSWORD="password123"
STUDENT_EMAIL="student@test.edu"
STUDENT_PASSWORD="password123"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_passed() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASSED++))
}

test_failed() {
    echo -e "${RED}✗ $1${NC}"
    ((FAILED++))
}

# Test 1: Professor Login
echo "Test 1: Professor Login"
PROF_RESPONSE=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"'$PROF_EMAIL'","password":"'$PROF_PASSWORD'"}')

PROF_TOKEN=$(echo $PROF_RESPONSE | jq -r '.access_token')
if [ "$PROF_TOKEN" != "null" ]; then
    test_passed "Professor login successful"
else
    test_failed "Professor login failed"
    exit 1
fi

# Test 2: Create Course
echo "Test 2: Create Course"
COURSE_RESPONSE=$(curl -s -X POST $API_URL/courses \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"course_name":"Test Course","course_code":"TEST101","semester":"Fall 2026"}')

COURSE_ID=$(echo $COURSE_RESPONSE | jq -r '.id')
if [ "$COURSE_ID" != "null" ]; then
    test_passed "Course created: $COURSE_ID"
else
    test_failed "Course creation failed"
fi

# Test 3: Request Presigned URL
echo "Test 3: Request Presigned Upload URL"
PRESIGN_RESPONSE=$(curl -s -X POST $API_URL/uploads/presign \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name":"test.pdf",
    "content_type":"application/pdf",
    "doc_type":"notes",
    "course_id":"'$COURSE_ID'"
  }')

UPLOAD_URL=$(echo $PRESIGN_RESPONSE | jq -r '.upload_url')
FILE_KEY=$(echo $PRESIGN_RESPONSE | jq -r '.file_key')

if [ "$UPLOAD_URL" != "null" ] && [ "$FILE_KEY" != "null" ]; then
    test_passed "Presigned URL generated"
else
    test_failed "Presigned URL generation failed"
fi

# Test 4: Invalid Content Type
echo "Test 4: Invalid Content Type"
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST $API_URL/uploads/presign \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name":"test.exe",
    "content_type":"application/x-msdownload",
    "doc_type":"notes",
    "course_id":"'$COURSE_ID'"
  }')

HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "400" ]; then
    test_passed "Invalid content type rejected"
else
    test_failed "Invalid content type not rejected (got $HTTP_CODE)"
fi

# Summary
echo ""
echo "=== Test Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
```

Run with:
```bash
chmod +x test_phase3a.sh
./test_phase3a.sh
```

---

## ✅ Success Criteria

All tests pass when:
- [ ] Professor can upload documents (rubrics, notes, sample solutions)
- [ ] Students can upload submissions
- [ ] Presigned URLs work correctly
- [ ] File existence verification works
- [ ] Access control enforced (enrollment, ownership)
- [ ] Invalid content types rejected
- [ ] Submissions can be resubmitted
- [ ] Late submissions marked correctly
- [ ] Document status tracking works
- [ ] Professor can view all submissions with student info
- [ ] Students can only view own submissions
- [ ] Document deletion works (professor only)
- [ ] Celery tasks queued successfully
- [ ] All API responses properly typed

## 🐛 Troubleshooting

**Issue:** Presigned URL returns 403 Forbidden
- Check MinIO credentials in .env
- Verify bucket exists: `mc ls myminio/gradeai-files`
- Check MinIO access policy

**Issue:** File not found after upload
- Verify file was actually uploaded to S3
- Check file_key format matches expected pattern
- Ensure MinIO is accessible from backend

**Issue:** Celery task not processing
- Check Celery worker is running
- Check Redis connection
- Look at Celery worker logs for errors

**Issue:** 401 Unauthorized
- Token expired, login again
- Verify token format in Authorization header

**Issue:** 403 Forbidden on submission
- Verify student is enrolled in course
- Check assignment belongs to the course
- Verify assignment is active
