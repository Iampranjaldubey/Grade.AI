# API Reference Documentation

## Overview

GradeAI exposes a RESTful API built with **FastAPI**. All endpoints are prefixed with `/api/v1/` and return JSON responses. The API uses **JWT-based authentication** with access and refresh tokens.

**Base URL**: `http://localhost:8000/api/v1` (development)

**API Version**: v1  
**Framework**: FastAPI 0.100+  
**Documentation**: Auto-generated at `/docs` (Swagger UI) and `/redoc` (ReDoc)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Endpoints by Module](#endpoints-by-module)
   - [Authentication & Users](#authentication--users)
   - [Courses](#courses)
   - [Enrollments](#enrollments)
   - [Assignments](#assignments)
   - [Rubrics](#rubrics)
   - [Uploads](#uploads)
   - [Submissions](#submissions)
   - [Evaluations](#evaluations)
   - [Analytics](#analytics)
   - [Health](#health)
3. [Common Patterns](#common-patterns)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)

---

## Authentication

All endpoints except `/auth/register`, `/auth/login`, and `/health` require a valid JWT access token.

### Authentication Flow

1. **Register** or **Login** to get tokens
2. Include access token in `Authorization` header: `Bearer <token>`
3. Access token expires in 15 minutes
4. Use refresh token to get new access token
5. Refresh token expires in 7 days

### Token Structure

**Access Token** (15 min expiry):
```json
{
  "sub": "user-uuid",
  "role": "professor|student|admin",
  "type": "access",
  "jti": "unique-token-id",
  "exp": 1234567890
}
```

**Refresh Token** (7 days expiry):
```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "jti": "unique-token-id",
  "exp": 1234567890
}
```

---

## Endpoints by Module

### Authentication & Users

#### POST /auth/register

**Description**: Register a new user account.

**Authentication**: None required

**Implementation**: `backend/app/api/v1/endpoints/auth.py:register()`

**Request Body**:
```json
{
  "email": "professor@example.com",
  "password": "SecurePass123!",
  "name": "Dr. Jane Smith",
  "role": "professor"
}
```

**Validation**:
- `email`: Valid email format
- `password`: 8-128 characters
- `name`: 1-255 characters
- `role`: `professor`, `student`, `ta`, or `admin`

**Response** (201 Created):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "professor@example.com",
    "name": "Dr. Jane Smith",
    "role": "professor",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z"
  }
}
```

**Errors**:
- `409 Conflict`: Email already registered

---

#### POST /auth/login

**Description**: Authenticate and obtain JWT tokens.

**Authentication**: None required

**Implementation**: `backend/app/api/v1/endpoints/auth.py:login()`

**Request Body**:
```json
{
  "email": "professor@example.com",
  "password": "SecurePass123!"
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "professor@example.com",
    "name": "Dr. Jane Smith",
    "role": "professor",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z"
  }
}
```

**Errors**:
- `401 Unauthorized`: Invalid credentials or inactive account
- `429 Too Many Requests`: Too many failed login attempts (locked out for 15 minutes)

**Security**:
- Failed login attempts tracked per email
- Lockout after 5 failed attempts within 15 minutes
- Password hashed with bcrypt (cost factor: 12)

---

#### POST /auth/refresh

**Description**: Refresh access token using refresh token.

**Authentication**: None (refresh token in body)

**Implementation**: `backend/app/api/v1/endpoints/auth.py:refresh_tokens()`

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "user": null
}
```

**Errors**:
- `401 Unauthorized`: Invalid or expired refresh token

**Notes**:
- Old refresh token is revoked
- New refresh token issued with new expiry
- Old access token immediately invalidated

---

#### POST /auth/logout

**Description**: Logout and revoke tokens.

**Authentication**: Required (Bearer token)

**Implementation**: `backend/app/api/v1/endpoints/auth.py:logout()`

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "message": "logged out"
}
```

**Notes**:
- Access token added to blacklist (expires after 15 minutes)
- Refresh token removed from Redis
- User must login again to get new tokens

---

#### GET /auth/me

**Description**: Get current authenticated user profile.

**Authentication**: Required (Bearer token)

**Implementation**: `backend/app/api/v1/endpoints/auth.py:get_me()`

**Response** (200 OK):
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "professor@example.com",
  "name": "Dr. Jane Smith",
  "role": "professor",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z"
}
```

---

### Courses

#### POST /courses

**Description**: Create a new course (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:create_course()`

**Request Body**:
```json
{
  "course_name": "Data Structures and Algorithms",
  "course_code": "CS-201",
  "semester": "Fall 2026",
  "description": "Introduction to fundamental data structures..."
}
```

**Validation**:
- `course_name`: 1-255 characters
- `course_code`: 1-64 characters, unique per professor
- `semester`: 1-64 characters
- `description`: Optional

**Response** (201 Created):
```json
{
  "id": "course-uuid",
  "course_name": "Data Structures and Algorithms",
  "course_code": "CS-201",
  "professor_id": "prof-uuid",
  "semester": "Fall 2026",
  "join_code": "ABC123",
  "description": "Introduction to fundamental data structures...",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z",
  "student_count": 0,
  "assignment_count": 0
}
```

**Errors**:
- `403 Forbidden`: User is not a professor
- `409 Conflict`: Professor already has a course with this `course_code`

**Notes**:
- `join_code` is automatically generated (6-character alphanumeric, uppercase)
- Join code is globally unique across all courses

---

#### GET /courses

**Description**: List professor's courses (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:list_courses()`

**Query Parameters**:
- `page` (optional): Page number (default: 1, min: 1)
- `size` (optional): Page size (default: 20, min: 1, max: 100)

**Response** (200 OK):
```json
[
  {
    "id": "course-uuid-1",
    "course_name": "Data Structures",
    "course_code": "CS-201",
    "professor_id": "prof-uuid",
    "semester": "Fall 2026",
    "join_code": "ABC123",
    "description": "...",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z",
    "student_count": 25,
    "assignment_count": 5
  }
]
```

---

#### GET /courses/{course_id}

**Description**: Get a single course (professor or enrolled student).

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/courses.py:get_course()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Response** (200 OK):
```json
{
  "id": "course-uuid",
  "course_name": "Data Structures",
  "course_code": "CS-201",
  "professor_id": "prof-uuid",
  "semester": "Fall 2026",
  "join_code": "ABC123",
  "description": "...",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z",
  "student_count": 25,
  "assignment_count": 5
}
```

**Errors**:
- `404 Not Found`: Course doesn't exist or user doesn't have access
- `403 Forbidden`: Student is not enrolled in course

---

#### PUT /courses/{course_id}

**Description**: Update a course (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:update_course()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Request Body** (all fields optional):
```json
{
  "course_name": "Advanced Data Structures",
  "course_code": "CS-301",
  "semester": "Spring 2027",
  "description": "Updated description..."
}
```

**Response** (200 OK):
```json
{
  "id": "course-uuid",
  "course_name": "Advanced Data Structures",
  "course_code": "CS-301",
  "professor_id": "prof-uuid",
  "semester": "Spring 2027",
  "join_code": "ABC123",
  "description": "Updated description...",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T15:00:00Z",
  "student_count": 25,
  "assignment_count": 5
}
```

**Errors**:
- `404 Not Found`: Course doesn't exist or professor doesn't own it
- `409 Conflict`: New `course_code` conflicts with another course

---

#### DELETE /courses/{course_id}

**Description**: Soft-delete a course (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:delete_course()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Response** (204 No Content)

**Errors**:
- `404 Not Found`: Course doesn't exist or professor doesn't own it
- `400 Bad Request`: Course has active enrollments (students must drop first)

**Notes**:
- Sets `is_active=false` (soft delete)
- Does not delete course data
- Students cannot enroll after deactivation

---

#### GET /courses/{course_id}/students

**Description**: List enrolled students (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:list_course_students()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `size` (optional): Page size (default: 20, max: 100)

**Response** (200 OK):
```json
[
  {
    "id": "student-uuid-1",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "enrolled_at": "2026-07-11T10:00:00Z",
    "submission_count": 3
  },
  {
    "id": "student-uuid-2",
    "name": "Jane Smith",
    "email": "jane.smith@example.com",
    "enrolled_at": "2026-07-11T11:00:00Z",
    "submission_count": 5
  }
]
```

---

### Enrollments

#### POST /enrollments/join

**Description**: Join a course using join code (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:join_course()`

**Request Body**:
```json
{
  "join_code": "ABC123"
}
```

**Response** (201 Created):
```json
{
  "id": "enrollment-uuid",
  "course_id": "course-uuid",
  "student_id": "student-uuid",
  "enrolled_at": "2026-07-11T10:00:00Z",
  "status": "active",
  "course": {
    "id": "course-uuid",
    "course_name": "Data Structures",
    "course_code": "CS-201",
    "professor_id": "prof-uuid",
    "semester": "Fall 2026",
    "description": "...",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z"
  }
}
```

**Errors**:
- `404 Not Found`: No active course with that join code
- `409 Conflict`: Already enrolled in this course

**Notes**:
- Join code is case-insensitive (normalized to uppercase)
- If student previously dropped, reactivates enrollment

---

#### GET /enrollments/my-courses

**Description**: List student's enrolled courses (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:my_courses()`

**Response** (200 OK):
```json
[
  {
    "id": "course-uuid-1",
    "course_name": "Data Structures",
    "course_code": "CS-201",
    "professor_id": "prof-uuid",
    "semester": "Fall 2026",
    "description": "...",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z"
  }
]
```

---

#### DELETE /enrollments/{course_id}

**Description**: Drop (unenroll from) a course (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/courses.py:drop_course()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Response** (204 No Content)

**Errors**:
- `404 Not Found`: Not enrolled in this course

**Notes**:
- Sets `status='dropped'` (soft delete)
- Student can re-enroll later using join code

---

### Assignments

#### POST /assignments

**Description**: Create an assignment (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:create_assignment()`

**Request Body**:
```json
{
  "course_id": "course-uuid",
  "title": "Binary Tree Implementation",
  "description": "Implement a binary search tree with insert, delete, and search operations.",
  "due_date": "2026-08-15T23:59:59Z",
  "max_score": 100.00,
  "grading_mode": "hybrid"
}
```

**Validation**:
- `title`: 1-512 characters
- `due_date`: Must be in future, ISO 8601 format with timezone
- `max_score`: Greater than 0, decimal with 2 decimal places
- `grading_mode`: `auto`, `manual`, or `hybrid`

**Response** (201 Created):
```json
{
  "id": "assignment-uuid",
  "course_id": "course-uuid",
  "title": "Binary Tree Implementation",
  "description": "Implement a binary search tree...",
  "due_date": "2026-08-15T23:59:59Z",
  "max_score": 100.00,
  "grading_mode": "hybrid",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z",
  "submission_count": 0
}
```

**Errors**:
- `403 Forbidden`: Professor doesn't own the course
- `400 Bad Request`: Due date is in the past

---

#### GET /assignments

**Description**: List assignments for a course (professor or enrolled student).

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:list_assignments()`

**Query Parameters**:
- `course_id` (required): Course UUID
- `page` (optional): Page number (default: 1)
- `size` (optional): Page size (default: 20, max: 100)

**Response** (200 OK):
```json
[
  {
    "id": "assignment-uuid-1",
    "course_id": "course-uuid",
    "title": "Binary Tree Implementation",
    "description": "...",
    "due_date": "2026-08-15T23:59:59Z",
    "max_score": 100.00,
    "grading_mode": "hybrid",
    "is_active": true,
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:00:00Z",
    "submission_count": 15
  }
]
```

**Errors**:
- `404 Not Found`: Course doesn't exist
- `403 Forbidden`: User doesn't have access to course

---

#### GET /assignments/{assignment_id}

**Description**: Get assignment with rubrics (professor or enrolled student).

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:get_assignment()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Response** (200 OK):
```json
{
  "id": "assignment-uuid",
  "course_id": "course-uuid",
  "title": "Binary Tree Implementation",
  "description": "...",
  "due_date": "2026-08-15T23:59:59Z",
  "max_score": 100.00,
  "grading_mode": "hybrid",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z",
  "rubrics": [
    {
      "id": "rubric-uuid-1",
      "assignment_id": "assignment-uuid",
      "criteria_name": "Code Correctness",
      "description": "Program produces correct output",
      "max_points": 40.00,
      "weight": 0.40,
      "evaluation_hints": "Check if all test cases pass",
      "created_at": "2026-07-11T10:05:00Z",
      "updated_at": "2026-07-11T10:05:00Z"
    },
    {
      "id": "rubric-uuid-2",
      "assignment_id": "assignment-uuid",
      "criteria_name": "Code Quality",
      "description": "Clean, readable, well-structured code",
      "max_points": 30.00,
      "weight": 0.30,
      "evaluation_hints": "Evaluate variable names, comments",
      "created_at": "2026-07-11T10:05:00Z",
      "updated_at": "2026-07-11T10:05:00Z"
    },
    {
      "id": "rubric-uuid-3",
      "assignment_id": "assignment-uuid",
      "criteria_name": "Documentation",
      "description": "Comments and docstrings",
      "max_points": 30.00,
      "weight": 0.30,
      "evaluation_hints": "Check function docstrings",
      "created_at": "2026-07-11T10:05:00Z",
      "updated_at": "2026-07-11T10:05:00Z"
    }
  ]
}
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist or not active
- `403 Forbidden`: User doesn't have access

---

#### PUT /assignments/{assignment_id}

**Description**: Update an assignment (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:update_assignment()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Request Body** (all fields optional):
```json
{
  "title": "Advanced Binary Tree",
  "description": "Updated requirements...",
  "due_date": "2026-08-20T23:59:59Z",
  "max_score": 120.00,
  "grading_mode": "auto"
}
```

**Response** (200 OK):
```json
{
  "id": "assignment-uuid",
  "course_id": "course-uuid",
  "title": "Advanced Binary Tree",
  "description": "Updated requirements...",
  "due_date": "2026-08-20T23:59:59Z",
  "max_score": 120.00,
  "grading_mode": "auto",
  "is_active": true,
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T16:00:00Z"
}
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist or professor doesn't own it
- `400 Bad Request`: Assignment has evaluated submissions (cannot update)

---

#### DELETE /assignments/{assignment_id}

**Description**: Soft-delete an assignment (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:delete_assignment()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Response** (204 No Content)

**Errors**:
- `404 Not Found`: Assignment doesn't exist or professor doesn't own it
- `400 Bad Request`: Assignment has evaluated submissions (cannot delete)

**Notes**:
- Sets `is_active=false`
- Does not delete submissions or evaluations
- Students cannot submit after deactivation

---

### Rubrics

#### POST /assignments/{assignment_id}/rubrics

**Description**: Replace all rubrics for an assignment (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:create_rubrics()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Request Body**:
```json
{
  "criteria": [
    {
      "criteria_name": "Code Correctness",
      "description": "Program produces correct output",
      "max_points": 40.00,
      "weight": 0.40,
      "evaluation_hints": "Check if all test cases pass"
    },
    {
      "criteria_name": "Code Quality",
      "description": "Clean, readable code",
      "max_points": 30.00,
      "weight": 0.30,
      "evaluation_hints": "Evaluate readability"
    },
    {
      "criteria_name": "Documentation",
      "description": "Comments and docstrings",
      "max_points": 30.00,
      "weight": 0.30,
      "evaluation_hints": "Check docstrings"
    }
  ]
}
```

**Validation**:
- `criteria_name`: 1-255 characters
- `max_points`: Greater than 0
- `weight`: 0.0 to 1.0 (should sum to 1.0 across all criteria)

**Response** (201 Created):
```json
[
  {
    "id": "rubric-uuid-1",
    "assignment_id": "assignment-uuid",
    "criteria_name": "Code Correctness",
    "description": "Program produces correct output",
    "max_points": 40.00,
    "weight": 0.40,
    "evaluation_hints": "Check if all test cases pass",
    "created_at": "2026-07-11T10:05:00Z",
    "updated_at": "2026-07-11T10:05:00Z"
  },
  ...
]
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist or professor doesn't own it

**Notes**:
- Deletes all existing rubrics before creating new ones (atomic operation)
- Sum of `max_points` should equal assignment's `max_score`
- Sum of `weight` should equal 1.0

---

#### GET /assignments/{assignment_id}/rubrics

**Description**: List rubrics for an assignment (professor or enrolled student).

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/assignments.py:list_rubrics()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Response** (200 OK):
```json
[
  {
    "id": "rubric-uuid-1",
    "assignment_id": "assignment-uuid",
    "criteria_name": "Code Correctness",
    "description": "...",
    "max_points": 40.00,
    "weight": 0.40,
    "evaluation_hints": "...",
    "created_at": "2026-07-11T10:05:00Z",
    "updated_at": "2026-07-11T10:05:00Z"
  }
]
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist
- `403 Forbidden`: User doesn't have access

---

### Uploads

#### POST /uploads/presign

**Description**: Generate presigned URL for file upload.

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/uploads.py:presign_upload()`

**Request Body**:
```json
{
  "course_id": "course-uuid",
  "assignment_id": "assignment-uuid",
  "doc_type": "notes",
  "file_name": "lecture01.pdf",
  "content_type": "application/pdf"
}
```

**Validation**:
- `doc_type`: `notes`, `sample_solution`, `rubric`, or `submission`
- `content_type`: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, or `text/plain`

**Response** (200 OK):
```json
{
  "upload_url": "https://minio.example.com/bucket/course-uuid/notes/uuid_lecture01.pdf?X-Amz-Algorithm=...",
  "file_key": "course-uuid/notes/uuid_lecture01.pdf",
  "expires_in": 3600
}
```

**Errors**:
- `404 Not Found`: Course or assignment doesn't exist
- `403 Forbidden`: User doesn't have access to course
- `400 Bad Request`: Invalid content type

**Notes**:
- Upload URL expires in 1 hour
- Use PUT request to upload file to `upload_url`
- After upload, call `/uploads/confirm` to create document record

---

#### POST /uploads/confirm

**Description**: Confirm file upload and create document record.

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/uploads.py:confirm_upload()`

**Request Body**:
```json
{
  "file_key": "course-uuid/notes/uuid_lecture01.pdf",
  "file_name": "lecture01.pdf",
  "course_id": "course-uuid",
  "assignment_id": "assignment-uuid",
  "doc_type": "notes",
  "file_size_bytes": 1048576
}
```

**Response** (201 Created):
```json
{
  "id": "document-uuid",
  "course_id": "course-uuid",
  "assignment_id": "assignment-uuid",
  "uploader_id": "user-uuid",
  "doc_type": "notes",
  "file_name": "lecture01.pdf",
  "file_url": "https://minio.example.com/...",
  "file_key": "course-uuid/notes/uuid_lecture01.pdf",
  "mime_type": "application/pdf",
  "file_size_bytes": 1048576,
  "parsed_text": null,
  "parse_status": "pending",
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T10:00:00Z"
}
```

**Errors**:
- `404 Not Found`: File not found in storage or course doesn't exist
- `403 Forbidden`: User doesn't have access to course

**Notes**:
- Triggers async document processing (parse, chunk, embed)
- `parse_status` transitions: `pending` → `processing` → `success`/`failed`
- Download URL (`file_url`) expires in 7 days

---

#### GET /uploads/{document_id}/status

**Description**: Get document processing status.

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/uploads.py:get_document_status()`

**Path Parameters**:
- `document_id` (UUID): Document identifier

**Response** (200 OK):
```json
{
  "id": "document-uuid",
  "file_name": "lecture01.pdf",
  "parse_status": "success",
  "chunk_count": 42
}
```

**Parse Status Values**:
- `pending`: Queued for processing
- `processing`: Currently being parsed
- `success`: Parsed and chunked successfully
- `failed`: Parsing failed

---

#### DELETE /uploads/{document_id}

**Description**: Delete a document (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/uploads.py:delete_document()`

**Path Parameters**:
- `document_id` (UUID): Document identifier

**Response** (204 No Content)

**Errors**:
- `404 Not Found`: Document doesn't exist
- `403 Forbidden`: Only course professor can delete documents

**Notes**:
- Deletes file from MinIO
- Deletes document record and all chunks (CASCADE)
- Removes embeddings from ChromaDB

---

#### GET /uploads/courses/{course_id}/documents

**Description**: List all documents for a course.

**Authentication**: Required

**Implementation**: `backend/app/api/v1/endpoints/uploads.py:list_course_documents()`

**Path Parameters**:
- `course_id` (UUID): Course identifier

**Response** (200 OK):
```json
[
  {
    "id": "document-uuid-1",
    "course_id": "course-uuid",
    "assignment_id": "assignment-uuid",
    "uploader_id": "prof-uuid",
    "doc_type": "notes",
    "file_name": "lecture01.pdf",
    "file_url": "https://minio.example.com/...",
    "file_key": "course-uuid/notes/uuid_lecture01.pdf",
    "mime_type": "application/pdf",
    "file_size_bytes": 1048576,
    "parsed_text": "Introduction to data structures...",
    "parse_status": "success",
    "created_at": "2026-07-11T10:00:00Z",
    "updated_at": "2026-07-11T10:05:00Z"
  }
]
```

**Errors**:
- `404 Not Found`: Course doesn't exist
- `403 Forbidden`: User doesn't have access to course

---

### Submissions

#### POST /submissions

**Description**: Submit an assignment (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/submissions.py:create_submission()`

**Request Body**:
```json
{
  "assignment_id": "assignment-uuid",
  "file_name": "my_solution.py",
  "file_key": "course-uuid/submission/uuid_my_solution.py",
  "file_size_bytes": 2048
}
```

**Validation**:
- `file_name`: 1-512 characters
- `file_key`: Must exist in MinIO
- `file_size_bytes`: Greater than 0

**Response** (201 Created):
```json
{
  "id": "submission-uuid",
  "assignment_id": "assignment-uuid",
  "student_id": "student-uuid",
  "file_url": "https://minio.example.com/...",
  "file_name": "my_solution.py",
  "submitted_at": "2026-08-14T10:00:00Z",
  "status": "submitted"
}
```

**Errors**:
- `404 Not Found`: Assignment or file doesn't exist
- `403 Forbidden`: Student not enrolled in course

**Notes**:
- Status is `submitted` if before due date, `late` if after
- Triggers async evaluation (15-second delay for document processing)
- Resubmissions overwrite previous submission

---

#### GET /submissions/{assignment_id}/my-submission

**Description**: Get student's own submission (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/submissions.py:get_my_submission()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Response** (200 OK):
```json
{
  "id": "submission-uuid",
  "assignment_id": "assignment-uuid",
  "student_id": "student-uuid",
  "file_url": "https://minio.example.com/...",
  "file_name": "my_solution.py",
  "submitted_at": "2026-08-14T10:00:00Z",
  "status": "evaluated"
}
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist or no submission found
- `403 Forbidden`: Student not enrolled in course

---

#### GET /submissions/{assignment_id}/all

**Description**: Get all submissions for an assignment (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/submissions.py:get_all_submissions()`

**Path Parameters**:
- `assignment_id` (UUID): Assignment identifier

**Response** (200 OK):
```json
[
  {
    "id": "submission-uuid-1",
    "assignment_id": "assignment-uuid",
    "student_id": "student-uuid-1",
    "file_url": "https://minio.example.com/...",
    "file_name": "solution.py",
    "submitted_at": "2026-08-14T10:00:00Z",
    "status": "evaluated",
    "student_name": "John Doe",
    "student_email": "john@example.com",
    "has_evaluation": true
  },
  {
    "id": "submission-uuid-2",
    "assignment_id": "assignment-uuid",
    "student_id": "student-uuid-2",
    "file_url": "https://minio.example.com/...",
    "file_name": "assignment.py",
    "submitted_at": "2026-08-15T10:00:00Z",
    "status": "late",
    "student_name": "Jane Smith",
    "student_email": "jane@example.com",
    "has_evaluation": false
  }
]
```

**Errors**:
- `404 Not Found`: Assignment doesn't exist or professor doesn't own course

---

### Evaluations

#### GET /evaluations/pending

**Description**: List pending AI evaluations (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:list_pending_evaluations()`

**Query Parameters**:
- `course_id` (optional): Filter by course UUID

**Response** (200 OK):
```json
[
  {
    "id": "eval-uuid-1",
    "submission_id": "sub-uuid-1",
    "ai_score": 72.50,
    "approval_status": "pending",
    "evaluated_at": "2026-08-14T12:00:00Z",
    "confidence_score": 0.45,
    "student_name": "John Doe",
    "student_email": "john@example.com",
    "assignment_title": "Binary Tree Implementation"
  },
  {
    "id": "eval-uuid-2",
    "submission_id": "sub-uuid-2",
    "ai_score": 88.00,
    "approval_status": "pending",
    "evaluated_at": "2026-08-14T13:00:00Z",
    "confidence_score": 0.85,
    "student_name": "Jane Smith",
    "student_email": "jane@example.com",
    "assignment_title": "Binary Tree Implementation"
  }
]
```

**Notes**:
- Sorted by `confidence_score` (lowest first = needs most review)
- Only shows evaluations from professor's courses

---

#### GET /evaluations/{evaluation_id}

**Description**: Get full evaluation details (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:get_evaluation_detail()`

**Path Parameters**:
- `evaluation_id` (UUID): Evaluation identifier

**Response** (200 OK):
```json
{
  "id": "eval-uuid",
  "submission_id": "sub-uuid",
  "ai_score": 85.50,
  "final_score": null,
  "ai_feedback": {
    "criteria_scores": [
      {
        "criteria_name": "Code Correctness",
        "score": 35.00,
        "max_points": 40.00,
        "feedback": "All main test cases pass. Missing edge case for empty tree."
      },
      {
        "criteria_name": "Code Quality",
        "score": 25.00,
        "max_points": 30.00,
        "feedback": "Clean structure, good variable names."
      },
      {
        "criteria_name": "Documentation",
        "score": 25.50,
        "max_points": 30.00,
        "feedback": "Good docstrings, some inline comments missing."
      }
    ],
    "overall_feedback": "Solid implementation with good testing...",
    "confidence_score": 0.75,
    "percentage": 85.50
  },
  "professor_feedback": null,
  "strengths": [
    "Well-structured code",
    "Comprehensive test cases",
    "Good documentation"
  ],
  "weaknesses": [
    "Missing edge case handling",
    "Some variable names unclear"
  ],
  "missing_topics": [
    "Error handling for invalid input"
  ],
  "approval_status": "pending",
  "evaluated_at": "2026-08-14T12:00:00Z",
  "approved_at": null
}
```

**Errors**:
- `404 Not Found`: Evaluation doesn't exist
- `403 Forbidden`: Professor doesn't own the course

---

#### POST /evaluations/{evaluation_id}/approve

**Description**: Approve AI evaluation without changes (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:approve_evaluation()`

**Path Parameters**:
- `evaluation_id` (UUID): Evaluation identifier

**Request Body**:
```json
{
  "professor_feedback": "AI evaluation is accurate. Well done!"
}
```

**Validation**:
- `professor_feedback`: Optional additional feedback

**Response** (200 OK):
```json
{
  "id": "eval-uuid",
  "submission_id": "sub-uuid",
  "ai_score": 85.50,
  "final_score": 85.50,
  "ai_feedback": {...},
  "professor_feedback": "AI evaluation is accurate. Well done!",
  "strengths": [...],
  "weaknesses": [...],
  "missing_topics": [...],
  "approval_status": "approved",
  "evaluated_at": "2026-08-14T12:00:00Z",
  "approved_at": "2026-08-14T14:30:00Z"
}
```

**Errors**:
- `404 Not Found`: Evaluation doesn't exist
- `403 Forbidden`: Professor doesn't own the course
- `400 Bad Request`: Evaluation already approved/overridden

**Notes**:
- Sets `final_score = ai_score`
- Sets `approval_status = 'approved'`
- Updates submission status to `evaluated`
- Student can now view grade

---

#### POST /evaluations/{evaluation_id}/override

**Description**: Override AI evaluation with manual score (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:override_evaluation()`

**Path Parameters**:
- `evaluation_id` (UUID): Evaluation identifier

**Request Body**:
```json
{
  "final_score": 92.00,
  "professor_feedback": "Good work! Added bonus points for exceptional implementation.",
  "criteria_overrides": [
    {
      "criteria_name": "Code Correctness",
      "score": 40.00,
      "reasoning": "Perfect implementation"
    }
  ]
}
```

**Validation**:
- `final_score`: Required, 0 to assignment's `max_score`
- `professor_feedback`: Required, min 1 character
- `criteria_overrides`: Optional per-criterion adjustments

**Response** (200 OK):
```json
{
  "id": "eval-uuid",
  "submission_id": "sub-uuid",
  "ai_score": 85.50,
  "final_score": 92.00,
  "ai_feedback": {...},
  "professor_feedback": "Good work! Added bonus points...",
  "strengths": [...],
  "weaknesses": [...],
  "missing_topics": [...],
  "approval_status": "overridden",
  "evaluated_at": "2026-08-14T12:00:00Z",
  "approved_at": "2026-08-14T14:30:00Z"
}
```

**Errors**:
- `404 Not Found`: Evaluation doesn't exist
- `403 Forbidden`: Professor doesn't own the course
- `400 Bad Request`: Evaluation already approved/overridden, or final_score exceeds max_score

**Notes**:
- Sets `final_score` to professor's score
- Sets `approval_status = 'overridden'`
- Updates submission status to `evaluated`

---

#### POST /evaluations/trigger/{submission_id}

**Description**: Manually trigger AI evaluation for a submission (professor only).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:trigger_evaluation()`

**Path Parameters**:
- `submission_id` (UUID): Submission identifier

**Response** (200 OK):
```json
{
  "message": "Evaluation queued",
  "submission_id": "sub-uuid",
  "task_id": "celery-task-id"
}
```

**Errors**:
- `404 Not Found`: Submission doesn't exist
- `403 Forbidden`: Professor doesn't own the course

**Use Cases**:
- Re-evaluate a submission
- Evaluate after fixing rubrics
- Evaluate after adding more course materials

---

#### GET /evaluations/submission/{submission_id}

**Description**: Student views their approved grade (student only).

**Authentication**: Required (student role)

**Implementation**: `backend/app/api/v1/endpoints/evaluations.py:get_student_evaluation()`

**Path Parameters**:
- `submission_id` (UUID): Submission identifier

**Response** (200 OK):
```json
{
  "id": "eval-uuid",
  "submission_id": "sub-uuid",
  "final_score": 85.50,
  "percentage": 85.50,
  "strengths": [
    "Well-structured code",
    "Comprehensive test cases"
  ],
  "weaknesses": [
    "Missing edge case handling"
  ],
  "missing_topics": [
    "Error handling for invalid input"
  ],
  "overall_feedback": "Solid implementation with good testing...",
  "criteria_scores": [
    {
      "criteria_name": "Code Correctness",
      "score": 35.00,
      "max_points": 40.00,
      "feedback": "All main test cases pass..."
    },
    {
      "criteria_name": "Code Quality",
      "score": 25.00,
      "max_points": 30.00,
      "feedback": "Clean structure..."
    },
    {
      "criteria_name": "Documentation",
      "score": 25.50,
      "max_points": 30.00,
      "feedback": "Good docstrings..."
    }
  ],
  "evaluated_at": "2026-08-14T12:00:00Z",
  "approved_at": "2026-08-14T14:30:00Z"
}
```

**Errors**:
- `404 Not Found`: Submission doesn't exist, not student's submission, or evaluation not approved yet
- `403 Forbidden`: Not the student's submission

**Notes**:
- Only shows approved or overridden evaluations
- Pending evaluations return 404 (not visible to students)
- Uses `final_score` (professor-approved) not `ai_score`

---

### Analytics

#### GET /analytics

**Description**: Analytics overview for professor (placeholder).

**Authentication**: Required (professor role)

**Implementation**: `backend/app/api/v1/endpoints/analytics.py:analytics_overview()`

**Response** (200 OK):
```json
{
  "submissions_graded": 0,
  "average_score": 0
}
```

**Notes**:
- Not fully implemented
- Future enhancement for dashboard metrics

---

### Health

#### GET /health

**Description**: System health check.

**Authentication**: None required

**Implementation**: `backend/app/api/v1/endpoints/health.py:health_check()`

**Response** (200 OK):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "db": {
    "status": "ok"
  },
  "redis": {
    "status": "ok"
  },
  "chromadb": {
    "status": "ok"
  }
}
```

**Status Values**:
- `ok`: All services operational
- `degraded`: Some services down
- `unavailable`: All services down

**Service Status**:
- `ok`: Service is reachable
- `unavailable`: Service is down

**Use Cases**:
- Load balancer health checks
- Monitoring and alerting
- Deployment validation

---

## Common Patterns

### Pagination

All list endpoints support pagination via query parameters:

```
GET /api/v1/courses?page=1&size=20
```

**Parameters**:
- `page`: Page number (default: 1, min: 1)
- `size`: Items per page (default: 20, min: 1, max: 100)

**Response Pattern**:
```json
[
  { "id": "...", ... },
  { "id": "...", ... }
]
```

**Notes**:
- No total count or pagination metadata in response
- Empty array if no results
- Future enhancement: Add pagination metadata

---

### Filtering

Some endpoints support filtering via query parameters:

**Evaluations by course**:
```
GET /api/v1/evaluations/pending?course_id=course-uuid
```

**Assignments by course** (required):
```
GET /api/v1/assignments?course_id=course-uuid
```

---

### Sorting

**Default Sorting**:
- Courses: `created_at DESC` (newest first)
- Assignments: `due_date ASC` (earliest first)
- Submissions: `submitted_at DESC` (newest first)
- Evaluations: `confidence_score ASC` (lowest confidence first)

**Custom Sorting**: Not currently supported

---

### Timestamps

All timestamps use **ISO 8601 format** with timezone:

```json
{
  "created_at": "2026-07-11T10:00:00Z",
  "updated_at": "2026-07-11T15:30:00Z"
}
```

**Server Timezone**: UTC  
**Client Timezone**: Converted by frontend

---

### UUIDs

All resource identifiers are **UUID v4**:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Format**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

### File Uploads

File uploads use **presigned URLs** (two-step process):

1. **Request presigned URL**:
   ```
   POST /api/v1/uploads/presign
   ```

2. **Upload file directly to MinIO**:
   ```
   PUT {upload_url}
   Content-Type: {content_type}
   Body: {file_binary}
   ```

3. **Confirm upload**:
   ```
   POST /api/v1/uploads/confirm
   ```

**Benefits**:
- Backend not involved in file transfer (scalability)
- Signed URLs prevent unauthorized access
- Direct upload to object storage

---

### Soft Deletes

Most resources use **soft delete** (`is_active=false`):

- **Courses**: `is_active=false`
- **Assignments**: `is_active=false`
- **Enrollments**: `status='dropped'`

**Hard Deletes** (physical deletion):
- **Documents**: Deletes file from MinIO and database
- **Evaluations**: Cascade delete with submission

---

## Error Handling

### Error Response Format

All errors return consistent JSON structure:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**HTTP Status Codes**:

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions (wrong role) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (email, join code) |
| 422 | Unprocessable Entity | Validation error (Pydantic) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Service temporarily down |

---

### Validation Errors

Pydantic validation errors return 422 with detailed field-level errors:

```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    },
    {
      "loc": ["body", "password"],
      "msg": "ensure this value has at least 8 characters",
      "type": "value_error.any_str.min_length",
      "ctx": {"limit_value": 8}
    }
  ]
}
```

---

### Common Error Scenarios

#### Invalid Token

**Request**:
```
GET /api/v1/courses
Authorization: Bearer invalid_token
```

**Response** (401):
```json
{
  "detail": "Could not validate credentials"
}
```

---

#### Insufficient Permissions

**Request** (student tries to create course):
```
POST /api/v1/courses
Authorization: Bearer {student_token}
```

**Response** (403):
```json
{
  "detail": "Not enough permissions"
}
```

---

#### Resource Not Found

**Request**:
```
GET /api/v1/courses/nonexistent-uuid
```

**Response** (404):
```json
{
  "detail": "Course not found"
}
```

---

#### Duplicate Resource

**Request** (register with existing email):
```
POST /api/v1/auth/register
{
  "email": "existing@example.com",
  ...
}
```

**Response** (409):
```json
{
  "detail": "Email already registered"
}
```

---

## Rate Limiting

### Login Rate Limiting

**Limits**:
- **5 failed attempts** per email within 15 minutes
- **Lockout duration**: 15 minutes

**Implementation**: Redis-based tracking

**Response** (429):
```json
{
  "detail": "Too many attempts"
}
```

---

### General Rate Limiting

**Not currently implemented**

**Future Enhancement**:
- 100 requests per minute per user
- 1000 requests per hour per IP
- Separate limits for file uploads

---

## Authentication Examples

### Register and Login Flow

```bash
# 1. Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "professor@example.com",
    "password": "SecurePass123!",
    "name": "Dr. Jane Smith",
    "role": "professor"
  }'

# Response: {access_token, refresh_token, user}

# 2. Use access token
curl -X GET http://localhost:8000/api/v1/courses \
  -H "Authorization: Bearer {access_token}"

# 3. Refresh token before expiry
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "{refresh_token}"
  }'

# Response: {new_access_token, new_refresh_token}

# 4. Logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "{refresh_token}"
  }'
```

---

### File Upload Flow

```bash
# 1. Request presigned URL
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "{course_id}",
    "assignment_id": "{assignment_id}",
    "doc_type": "notes",
    "file_name": "lecture01.pdf",
    "content_type": "application/pdf"
  }'

# Response: {upload_url, file_key, expires_in}

# 2. Upload file to presigned URL
curl -X PUT "{upload_url}" \
  -H "Content-Type: application/pdf" \
  --data-binary "@lecture01.pdf"

# 3. Confirm upload
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "{file_key}",
    "file_name": "lecture01.pdf",
    "course_id": "{course_id}",
    "assignment_id": "{assignment_id}",
    "doc_type": "notes",
    "file_size_bytes": 1048576
  }'

# Response: {document_record}
```

---

## API Versioning

**Current Version**: v1

**URL Pattern**: `/api/v1/{endpoint}`

**Future Versions**:
- New major versions: `/api/v2/...`
- Old versions deprecated after 6 months
- Breaking changes only in major versions

---

## Related Documentation

- **Workflows**: See [PROJECT_FLOW.md](./PROJECT_FLOW.md) for complete user journeys
- **Database**: See [DATABASE.md](./DATABASE.md) for data models and relationships
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- **RAG Pipeline**: See [RAG_ARCHITECTURE.md](./RAG_ARCHITECTURE.md) for AI evaluation details

---

**Last Updated**: 2026-07-11  
**API Version**: v1  
**Framework**: FastAPI 0.100+  
**OpenAPI Docs**: `/docs` (Swagger UI)  
**ReDoc**: `/redoc`
