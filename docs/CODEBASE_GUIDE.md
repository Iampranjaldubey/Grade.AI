# Codebase Guide

## Overview

This guide helps developers navigate the GradeAI codebase, understand the purpose of each directory, locate important classes and services, and know which files to modify for common feature requests.

**Project Structure**: Monorepo with separate frontend (React) and backend (FastAPI) applications.

---

## Table of Contents

1. [Repository Structure](#repository-structure)
2. [Backend Structure](#backend-structure)
3. [Frontend Structure](#frontend-structure)
4. [Important Classes & Services](#important-classes--services)
5. [Feature Entry Points](#feature-entry-points)
6. [Common Modification Scenarios](#common-modification-scenarios)

---

## Repository Structure

```
Grade.Ai/
├── backend/           # FastAPI backend application
├── frontend/          # React frontend application
├── docs/             # Project documentation
├── .github/          # GitHub workflows and actions
├── docker-compose.yml
└── README.md
```

### Root Level Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local development environment (all services) |
| `.env.example` | Example environment variables |
| `README.md` | Project overview and setup instructions |

---

## Backend Structure

```
backend/
├── alembic/              # Database migrations
│   ├── versions/         # Migration scripts
│   ├── env.py           # Alembic environment config
│   └── script.py.mako   # Migration template
├── app/                  # Main application code
│   ├── api/             # API endpoints
│   ├── core/            # Core utilities
│   ├── db/              # Database configuration
│   ├── infrastructure/  # External services
│   ├── models/          # SQLAlchemy models
│   ├── rag/             # RAG pipeline
│   ├── schemas/         # Pydantic schemas
│   ├── services/        # Business logic
│   ├── tasks/           # Celery tasks
│   ├── celery_app.py    # Celery configuration
│   └── main.py          # FastAPI application
├── scripts/             # Utility scripts
├── tests/               # Test suite
├── alembic.ini          # Alembic configuration
├── requirements.txt     # Python dependencies
└── pyproject.toml       # Project metadata
```

### Backend Directory Purposes

#### `/backend/alembic/`

**Purpose**: Database schema versioning and migrations

**Key Files**:
- `versions/*.py`: Sequential migration scripts
- `env.py`: Migration environment setup (connects to PostgreSQL)
- `alembic.ini`: Configuration (connection string, etc.)

**When to Use**:
- Adding/modifying database tables
- Adding/modifying columns
- Creating indexes or constraints

**Commands**:
```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

---

#### `/backend/app/api/`

**Purpose**: REST API endpoints organized by version and resource

**Structure**:
```
api/
└── v1/
    ├── endpoints/        # Individual endpoint modules
    │   ├── auth.py      # Authentication endpoints
    │   ├── courses.py   # Course management
    │   ├── assignments.py
    │   ├── submissions.py
    │   ├── evaluations.py
    │   ├── uploads.py
    │   └── ...
    ├── router.py        # API v1 router aggregator
    └── __init__.py
```

**Key Concepts**:
- Each module handles one resource (e.g., courses, assignments)
- Endpoints use FastAPI decorators (`@router.post`, `@router.get`)
- Dependencies injected via `Depends()` (auth, database, services)
- Request/response validated by Pydantic schemas

**Entry Point**: `backend/app/api/v1/router.py` aggregates all endpoint routers

---

#### `/backend/app/core/`

**Purpose**: Core utilities, configuration, security, and middleware

**Key Files**:
- `config.py`: Application settings (environment variables, Pydantic Settings)
- `security.py`: Password hashing, JWT token creation/validation
- `deps.py`: FastAPI dependencies (get_db, get_current_user, role checks)
- `enums.py`: Application-wide enums (UserRole, SubmissionStatus, etc.)
- `exceptions.py`: Custom exception classes
- `handlers.py`: Global exception handlers
- `middleware.py`: Custom middleware (CORS, logging, etc.)
- `lifespan.py`: Application startup/shutdown lifecycle
- `logging.py`: Structured logging configuration (structlog)

**Most Referenced**:
- `deps.py:get_current_user()` - Used in nearly every endpoint for authentication
- `config.py:Settings` - Accessed via `Depends(get_settings)` for configuration
- `security.py:create_access_token()` - JWT generation

---

#### `/backend/app/db/`

**Purpose**: Database connection and session management

**Key Files**:
- `session.py`: Async SQLAlchemy engine and session factory
- `sync_session.py`: Synchronous session (for Celery tasks)
- `base.py`: SQLAlchemy declarative base
- `types.py`: Custom SQLAlchemy types (pg_enum, FlexibleJSON)

**Key Concepts**:
- Async sessions for FastAPI endpoints
- Sync sessions for Celery workers
- Connection pooling configured in `session.py`

---

#### `/backend/app/infrastructure/`

**Purpose**: Clients for external services

**Key Files**:
- `chromadb_client.py`: ChromaDB vector database client
- `redis_client.py`: Redis connection manager (3 databases)

**Redis Databases**:
- DB 0: Celery task queue and results
- DB 1: Session management (JWT blacklist, refresh tokens)
- DB 2: Application cache (planned, not fully used)

**ChromaDB Usage**:
- Collections per assignment: `assignment_{uuid}`
- Stores document chunk embeddings (768-dimensional vectors)
- Metadata: `doc_type`, `course_id`, `assignment_id`, `chunk_index`

---

#### `/backend/app/models/`

**Purpose**: SQLAlchemy ORM models (database tables)

**All Models** (10 tables):
- `user.py`: Users table (professors, students, admins)
- `course.py`: Courses with join codes
- `enrollment.py`: Student-course relationships
- `assignment.py`: Assignments with due dates and grading modes
- `rubric.py`: Grading criteria for assignments
- `document.py`: Uploaded files (notes, samples, rubrics)
- `document_chunk.py`: Text chunks for RAG
- `submission.py`: Student submissions
- `evaluation.py`: AI and professor evaluations
- `audit_log.py`: Activity audit trail
- `mixins.py`: Shared model functionality (UUIDs, timestamps)

**Key Concepts**:
- All models use UUID primary keys
- Timestamps auto-managed (`created_at`, `updated_at`)
- Relationships defined with SQLAlchemy `relationship()`
- Foreign keys with explicit cascade behaviors

---

#### `/backend/app/rag/`

**Purpose**: RAG (Retrieval-Augmented Generation) pipeline components

**Key Files**:
- `parsers.py`: Document parsing (PDF, DOCX, TXT)
  - Class: `UnifiedDocumentParser`
  - Methods: `parse()`, `_parse_pdf()`, `_parse_docx()`, `_parse_txt()`
- `chunker.py`: Text chunking
  - Class: `SemanticChunker`
  - Method: `create_chunks()` - Word-based chunking with overlap
- `embeddings.py`: Embedding generation
  - Class: `GeminiEmbeddings`
  - Method: `embed()` - Calls Google Gemini text-embedding-004
- `retrieval.py`: Context retrieval
  - Class: `RetrievalService`
  - Method: `retrieve_context()` - Queries ChromaDB for relevant chunks
- `evaluator.py`: AI evaluation
  - Class: `RubricEvaluator`
  - Method: `evaluate()` - Constructs prompt and calls Gemini 1.5 Pro
- `__init__.py`: Module exports

**Key Workflows**:
1. **Document Processing**: `parsers` → `chunker` → `embeddings` → ChromaDB
2. **Submission Evaluation**: `retrieval` → `evaluator` → JSON response

---

#### `/backend/app/schemas/`

**Purpose**: Pydantic models for request/response validation

**Key Files** (match model names):
- `user.py`: UserCreate, UserLogin, UserRead, TokenResponse
- `course.py`: CourseCreate, CourseUpdate, CourseOut
- `assignment.py`: AssignmentCreate, AssignmentOut, AssignmentWithRubrics
- `rubric.py`: RubricCreate, RubricOut
- `submission.py`: SubmissionCreate, SubmissionOut
- `evaluation.py`: EvaluationOut, ApproveEvaluationRequest, StudentEvaluationOut
- `document.py`: PresignRequest, ConfirmUploadRequest, DocumentOut
- `health.py`: HealthResponse, ServiceStatus
- `enrollment.py`: JoinCourseRequest, EnrollmentOut

**Key Concepts**:
- Separate schemas for Create, Update, and Read operations
- Automatic validation of request bodies
- Type hints for IDE autocomplete
- Pydantic v2 features (`model_config`, `Field()`)

---

#### `/backend/app/services/`

**Purpose**: Business logic and external service integrations

**Key Files**:
- `s3_service.py`: MinIO/S3 client
  - Class: `S3Service`
  - Methods: `generate_presigned_upload_url()`, `generate_presigned_download_url()`, `file_exists()`, `delete_file()`

**Service Pattern**:
- Encapsulates complex operations
- Reusable across multiple endpoints
- Dependency injection via `Depends()`

---

#### `/backend/app/tasks/`

**Purpose**: Asynchronous Celery tasks

**Key Files**:
- `grading.py`: All grading-related tasks
  - `process_document_task()`: Parse, chunk, embed documents
  - `chunk_and_embed_task()`: Generate embeddings for chunks
  - `evaluate_submission_task()`: AI evaluation of submissions

**Key Concepts**:
- Decorated with `@celery_app.task()`
- Retry logic with exponential backoff
- Uses sync database sessions (not async)
- Task results stored in Redis

**Invocation**:
```python
from app.tasks.grading import process_document_task
process_document_task.delay(document_id)  # Async
```

---

#### `/backend/app/main.py`

**Purpose**: FastAPI application entry point

**Key Components**:
- App initialization with lifespan context
- CORS middleware configuration
- Exception handler registration
- API router mounting (`/api/v1`)
- Root endpoint redirect to `/docs`

**Startup Process**:
1. Load configuration from environment
2. Connect to PostgreSQL
3. Connect to Redis
4. Initialize ChromaDB client
5. Mount API routers
6. Start accepting requests

---

#### `/backend/app/celery_app.py`

**Purpose**: Celery application configuration

**Key Configuration**:
- Broker: Redis DB 0 (`redis://redis:6379/0`)
- Backend: Redis DB 0 (task results)
- Task discovery: `app.tasks` module
- Timezone: UTC
- Task serialization: JSON

**Workers**:
```bash
celery -A app.celery_app worker --loglevel=info
```

---

## Frontend Structure

```
frontend/
├── public/          # Static assets
├── src/
│   ├── components/  # React components
│   ├── hooks/       # Custom React hooks
│   ├── lib/         # Utilities and API client
│   ├── pages/       # Page components (routes)
│   ├── store/       # Zustand state management
│   ├── types/       # TypeScript type definitions
│   ├── App.tsx      # Root component
│   ├── main.tsx     # Entry point
│   └── index.css    # Global styles (Tailwind)
├── index.html       # HTML template
├── vite.config.ts   # Vite configuration
└── package.json     # Dependencies
```

### Frontend Directory Purposes

#### `/frontend/src/components/`

**Purpose**: Reusable React components

**Typical Structure**:
```
components/
├── ui/              # Base UI components (buttons, inputs, modals)
├── layout/          # Layout components (header, sidebar, footer)
├── forms/           # Form components
├── course/          # Course-specific components
├── assignment/      # Assignment-specific components
└── ...
```

**Key Concepts**:
- Component-based architecture
- Props for configuration
- TypeScript for type safety
- Tailwind CSS for styling

---

#### `/frontend/src/hooks/`

**Purpose**: Custom React hooks for shared logic

**Common Hooks**:
- `useAuth.ts`: Authentication state and methods
- `useApi.ts`: API request wrapper with auth
- `useUpload.ts`: File upload with progress
- Form hooks (react-hook-form)
- Query hooks (react-query/TanStack Query)

**Pattern**:
```typescript
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  // ...
  return { user, login, logout, isAuthenticated };
}
```

---

#### `/frontend/src/lib/`

**Purpose**: Utility functions and API client

**Key Files**:
- `api.ts`: Axios instance with interceptors
- `utils.ts`: Helper functions
- `constants.ts`: Application constants

**API Client**:
```typescript
// lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Request interceptor (add auth token)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (handle 401, refresh token)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle token refresh
  }
);
```

---

#### `/frontend/src/pages/`

**Purpose**: Top-level page components (one per route)

**Common Pages**:
- `Login.tsx`: Login form
- `Register.tsx`: Registration form
- `Dashboard.tsx`: User dashboard
- `CourseList.tsx`: List of courses
- `CourseDetail.tsx`: Single course view
- `AssignmentDetail.tsx`: Assignment view with rubrics
- `SubmissionForm.tsx`: File upload for submissions
- `EvaluationList.tsx`: Pending evaluations (professor)
- `GradeView.tsx`: Student grade view

**Routing** (React Router):
```typescript
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/courses" element={<CourseList />} />
  <Route path="/courses/:id" element={<CourseDetail />} />
  <Route path="/assignments/:id" element={<AssignmentDetail />} />
  // ...
</Routes>
```

---

#### `/frontend/src/store/`

**Purpose**: Global state management with Zustand

**Key Stores**:
- `authStore.ts`: User authentication state
- `courseStore.ts`: Course data cache
- `assignmentStore.ts`: Assignment data cache

**Zustand Pattern**:
```typescript
// store/authStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('access_token'),
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    set({ user: response.data.user, accessToken: response.data.access_token });
    localStorage.setItem('access_token', response.data.access_token);
  },
  logout: () => {
    set({ user: null, accessToken: null });
    localStorage.removeItem('access_token');
  },
}));
```

---

#### `/frontend/src/types/`

**Purpose**: TypeScript type definitions

**Key Files**:
- `index.ts`: Centralized type exports
- `api.ts`: API request/response types
- `models.ts`: Domain model types (User, Course, Assignment, etc.)

**Type Definitions**:
```typescript
// types/models.ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'professor' | 'student' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  course_name: string;
  course_code: string;
  professor_id: string;
  semester: string;
  join_code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  student_count?: number;
  assignment_count?: number;
}
```

---

## Important Classes & Services

### Backend Core Classes

#### 1. `UnifiedDocumentParser` (`backend/app/rag/parsers.py`)

**Purpose**: Parse uploaded documents into plain text

**Key Methods**:
- `parse(file_path: str, mime_type: str) -> str`
- `_parse_pdf(file_path: str) -> str` (uses PyMuPDF)
- `_parse_docx(file_path: str) -> str` (uses python-docx)
- `_parse_txt(file_path: str) -> str`

**Usage**:
```python
parser = UnifiedDocumentParser()
text = parser.parse("/path/to/file.pdf", "application/pdf")
```

---

#### 2. `SemanticChunker` (`backend/app/rag/chunker.py`)

**Purpose**: Split text into semantically meaningful chunks for RAG

**Key Methods**:
- `create_chunks(text: str, metadata: dict) -> List[DocumentChunk]`

**Configuration**:
- Chunk size: 500 tokens
- Overlap: 50 tokens
- Word-based splitting (preserves sentences)

**Usage**:
```python
chunker = SemanticChunker()
chunks = chunker.create_chunks(text, metadata={
    "document_id": doc_id,
    "doc_type": "notes",
    "course_id": course_id,
    "assignment_id": assignment_id
})
```

---

#### 3. `GeminiEmbeddings` (`backend/app/rag/embeddings.py`)

**Purpose**: Generate vector embeddings using Google Gemini

**Key Methods**:
- `embed(texts: List[str]) -> List[List[float]]`

**Configuration**:
- Model: `text-embedding-004`
- Dimensions: 768
- Batch processing support

**Usage**:
```python
embedder = GeminiEmbeddings(api_key=settings.GEMINI_API_KEY)
embeddings = embedder.embed(["chunk1 text", "chunk2 text"])
```

---

#### 4. `RetrievalService` (`backend/app/rag/retrieval.py`)

**Purpose**: Retrieve relevant document chunks for evaluation context

**Key Methods**:
- `retrieve_context(assignment_id: UUID, query_text: str) -> dict`

**Retrieval Strategy**:
- Sample solutions: top 10 chunks
- Lecture notes: top 15 chunks
- Rubric documents: top 5 chunks
- Filters by `doc_type` and `assignment_id` metadata

**Usage**:
```python
retrieval = RetrievalService(chroma_client, embedder)
context = retrieval.retrieve_context(assignment_id, submission_text)
# Returns: {
#   "sample_solutions": [chunks],
#   "notes": [chunks],
#   "rubrics": [chunks]
# }
```

---

#### 5. `RubricEvaluator` (`backend/app/rag/evaluator.py`)

**Purpose**: Evaluate submissions using AI with rubric-based grading

**Key Methods**:
- `evaluate(submission_text: str, rubrics: List[Rubric], context: dict) -> dict`
- `_build_evaluation_prompt(...)` (private)

**Evaluation Process**:
1. Build prompt with rubrics, context, and submission
2. Call Gemini 1.5 Pro
3. Parse JSON response
4. Fallback evaluation if parsing fails

**Response Structure**:
```python
{
    "criteria_scores": [
        {
            "criteria_name": "Code Correctness",
            "score": 35.0,
            "max_points": 40.0,
            "feedback": "..."
        }
    ],
    "overall_score": 85.5,
    "percentage": 85.5,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "missing_topics": ["...", "..."],
    "confidence_score": 0.75
}
```

---

#### 6. `S3Service` (`backend/app/services/s3_service.py`)

**Purpose**: MinIO/S3 file storage operations

**Key Methods**:
- `generate_presigned_upload_url(file_key: str, content_type: str, expires: int) -> str`
- `generate_presigned_download_url(file_key: str, expires: int) -> str`
- `file_exists(file_key: str) -> bool`
- `delete_file(file_key: str) -> None`

**Configuration**:
- Endpoint: MinIO server URL
- Bucket: `gradeai-uploads`
- Access/Secret keys from environment

**Usage**:
```python
s3 = S3Service(settings)
upload_url = s3.generate_presigned_upload_url(
    file_key="course_id/notes/uuid_file.pdf",
    content_type="application/pdf",
    expires=3600
)
```

---

#### 7. `ChromaDBClient` (`backend/app/infrastructure/chromadb_client.py`)

**Purpose**: Vector database client for embeddings

**Key Methods**:
- `get_or_create_collection(name: str) -> Collection`
- `ping() -> bool` (health check)

**Collection Naming**: `assignment_{assignment_id}`

**Usage**:
```python
chroma = ChromaDBClient(settings)
collection = chroma.get_or_create_collection(f"assignment_{assignment_id}")
collection.add(
    ids=[chunk_id],
    embeddings=[embedding],
    documents=[text],
    metadatas=[metadata]
)
```

---

### Frontend Core Components

#### 1. Auth Store (`frontend/src/store/authStore.ts`)

**Purpose**: Global authentication state

**Key State**:
- `user: User | null`
- `accessToken: string | null`
- `refreshToken: string | null`

**Key Actions**:
- `login(email, password)`
- `logout()`
- `refreshAccessToken()`

---

#### 2. API Client (`frontend/src/lib/api.ts`)

**Purpose**: Centralized HTTP client with auth

**Features**:
- Automatic token injection
- Token refresh on 401
- Request/response interceptors
- Error handling

---

## Feature Entry Points

### Where Authentication Begins

**Backend Entry**: `backend/app/api/v1/endpoints/auth.py`

**Key Endpoints**:
1. `POST /api/v1/auth/register` → `register()`
2. `POST /api/v1/auth/login` → `login()`
3. `POST /api/v1/auth/refresh` → `refresh_tokens()`
4. `POST /api/v1/auth/logout` → `logout()`

**Authentication Flow**:
```
1. User submits credentials
   ↓
2. auth.py:login() validates credentials
   ↓
3. core/security.py:verify_password() checks hash
   ↓
4. core/security.py:create_access_token() generates JWT
   ↓
5. Token stored in Redis (refresh token)
   ↓
6. Tokens returned to client
```

**Dependency Injection** (`core/deps.py`):
- `get_current_user()`: Validates JWT, returns User object
- `get_current_professor()`: Ensures user role is professor
- `get_current_student()`: Ensures user role is student

**Usage in Endpoints**:
```python
@router.get("/courses")
async def list_courses(
    current_user: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
):
    # current_user is authenticated and is a professor
    ...
```

---

### Where Uploads Begin

**Backend Entry**: `backend/app/api/v1/endpoints/uploads.py`

**Upload Flow** (3-step process):

1. **Request Presigned URL** → `presign_upload()`
   - Endpoint: `POST /api/v1/uploads/presign`
   - Generates MinIO presigned PUT URL
   - Returns: `{upload_url, file_key, expires_in}`

2. **Client Uploads File** (direct to MinIO)
   - Client: `PUT {upload_url}` with file binary
   - Not through backend (scalability)

3. **Confirm Upload** → `confirm_upload()`
   - Endpoint: `POST /api/v1/uploads/confirm`
   - Creates `Document` record in PostgreSQL
   - Triggers async processing: `tasks/grading.py:process_document_task()`

**File Storage Service**: `backend/app/services/s3_service.py:S3Service`

**Processing Pipeline**:
```
confirm_upload()
  ↓
Queue: process_document_task(document_id)
  ↓
Parse: rag/parsers.py:UnifiedDocumentParser.parse()
  ↓
Chunk: rag/chunker.py:SemanticChunker.create_chunks()
  ↓
Embed: rag/embeddings.py:GeminiEmbeddings.embed()
  ↓
Store: ChromaDB collection.add()
```

**Frontend Entry**: `frontend/src/hooks/useUpload.ts` (or similar component)

---

### Where Grading Begins

**Backend Entry**: `backend/app/tasks/grading.py:evaluate_submission_task()`

**Trigger Points**:
1. **Automatic**: After student submits assignment
   - `api/v1/endpoints/submissions.py:create_submission()`
   - Queues evaluation with 15-second countdown

2. **Manual**: Professor triggers re-evaluation
   - `api/v1/endpoints/evaluations.py:trigger_evaluation()`

**Evaluation Pipeline**:
```
evaluate_submission_task(submission_id)
  ↓
1. Load submission, assignment, rubrics from DB
  ↓
2. Parse submission file (if not already parsed)
  ↓
3. Retrieve context from ChromaDB
   rag/retrieval.py:RetrievalService.retrieve_context()
  ↓
4. Build evaluation prompt with rubrics + context
   rag/evaluator.py:RubricEvaluator._build_evaluation_prompt()
  ↓
5. Call Gemini 1.5 Pro for evaluation
   rag/evaluator.py:RubricEvaluator.evaluate()
  ↓
6. Parse JSON response
  ↓
7. Create Evaluation record in DB
   models/evaluation.py:Evaluation
  ↓
8. Update submission status to 'evaluated'
```

**Key Classes**:
- `RetrievalService` (context gathering)
- `RubricEvaluator` (AI evaluation)
- Celery task: `evaluate_submission_task()`

---

### Where Retrieval Begins

**Backend Entry**: `backend/app/rag/retrieval.py:RetrievalService.retrieve_context()`

**Called From**: `tasks/grading.py:evaluate_submission_task()`

**Retrieval Process**:
```
1. Generate embedding for submission text
   ↓
2. Query ChromaDB collection for assignment
   ↓
3. Filter by metadata:
   - doc_type: 'sample_solution', 'notes', 'rubric'
   - assignment_id: target assignment
   ↓
4. Retrieve top-k chunks per document type:
   - sample_solution: 10 chunks
   - notes: 15 chunks
   - rubric: 5 chunks
   ↓
5. Return organized context dict
```

**ChromaDB Query**:
```python
collection.query(
    query_embeddings=[submission_embedding],
    where={"$and": [
        {"assignment_id": str(assignment_id)},
        {"doc_type": "sample_solution"}
    ]},
    n_results=10
)
```

**Context Structure**:
```python
{
    "sample_solutions": [
        {
            "id": "chunk_id",
            "text": "chunk text",
            "metadata": {...},
            "distance": 0.15  # cosine distance
        }
    ],
    "notes": [...],
    "rubrics": [...]
}
```

---

### Where Course Creation Begins

**Backend Entry**: `backend/app/api/v1/endpoints/courses.py:create_course()`

**Frontend Entry**: `frontend/src/pages/CourseCreate.tsx` (or similar)

**Flow**:
```
Professor fills form (name, code, semester)
  ↓
POST /api/v1/courses
  ↓
courses.py:create_course()
  ↓
Generate unique 8-char join_code
  ↓
Create Course record in DB
  ↓
Return course with join_code to frontend
```

**Join Code Generation** (`courses.py:_unique_join_code()`):
- 6-character alphanumeric (uppercase)
- Retries up to 10 times if collision
- Globally unique across all courses

---

### Where Assignment Creation Begins

**Backend Entry**: `backend/app/api/v1/endpoints/assignments.py:create_assignment()`

**Frontend Entry**: `frontend/src/pages/AssignmentCreate.tsx` (or similar)

**Flow**:
```
Professor fills form (title, due_date, max_score, grading_mode)
  ↓
POST /api/v1/assignments
  ↓
assignments.py:create_assignment()
  ↓
Validate due_date > NOW()
  ↓
Create Assignment record
  ↓
Professor adds rubrics (separate endpoint)
```

**Rubric Creation**: `assignments.py:create_rubrics()`
- Atomic replacement (delete all, insert new)
- Validates weights sum to 1.0 (application logic)

---

### Where Submission Evaluation Review Begins

**Backend Entry**: `backend/app/api/v1/endpoints/evaluations.py`

**Frontend Entry**: `frontend/src/pages/EvaluationList.tsx` (or similar)

**Professor Workflow**:
```
1. GET /api/v1/evaluations/pending
   → evaluations.py:list_pending_evaluations()
   → Returns evaluations sorted by confidence_score (lowest first)

2. GET /api/v1/evaluations/{id}
   → evaluations.py:get_evaluation_detail()
   → Shows full feedback, chunks, scores

3a. POST /api/v1/evaluations/{id}/approve
    → evaluations.py:approve_evaluation()
    → Sets final_score = ai_score

   OR

3b. POST /api/v1/evaluations/{id}/override
    → evaluations.py:override_evaluation()
    → Sets final_score = professor's score
```

**Student View**:
```
GET /api/v1/evaluations/submission/{submission_id}
  ↓
evaluations.py:get_student_evaluation()
  ↓
Returns only approved evaluations with final_score
```

---

## Common Modification Scenarios

### Scenario 1: Add a New API Endpoint

**Files to Modify**:

1. **Create Pydantic Schemas** (`backend/app/schemas/`)
   - Request schema (e.g., `MyFeatureCreate`)
   - Response schema (e.g., `MyFeatureOut`)

2. **Add Endpoint** (`backend/app/api/v1/endpoints/`)
   - Create new file or add to existing resource file
   - Define route with `@router.post()`, `@router.get()`, etc.
   - Use `Depends()` for authentication, database

3. **Register Router** (`backend/app/api/v1/router.py`)
   - Import router
   - Include in main router: `router.include_router(...)`

**Example**:
```python
# backend/app/schemas/my_feature.py
class MyFeatureCreate(BaseModel):
    name: str
    value: int

class MyFeatureOut(BaseModel):
    id: uuid.UUID
    name: str
    value: int
    created_at: datetime

# backend/app/api/v1/endpoints/my_feature.py
from fastapi import APIRouter, Depends
from app.core.deps import get_current_user, get_db

router = APIRouter()

@router.post("", response_model=MyFeatureOut)
async def create_feature(
    payload: MyFeatureCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Implementation
    ...

# backend/app/api/v1/router.py
from app.api.v1.endpoints import my_feature

router.include_router(my_feature.router, prefix="/my-feature", tags=["my-feature"])
```

---

### Scenario 2: Add a New Database Table

**Files to Modify**:

1. **Create Model** (`backend/app/models/`)
   ```python
   # backend/app/models/my_table.py
   from app.db.session import Base
   from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
   
   class MyTable(UUIDPrimaryKeyMixin, TimestampMixin, Base):
       __tablename__ = "my_table"
       
       name: Mapped[str] = mapped_column(String(255), nullable=False)
       value: Mapped[int] = mapped_column(Integer, nullable=False)
   ```

2. **Import in `models/__init__.py`**
   ```python
   from app.models.my_table import MyTable
   ```

3. **Create Migration**
   ```bash
   alembic revision --autogenerate -m "add my_table"
   ```

4. **Review and Apply Migration**
   ```bash
   # Review generated migration in alembic/versions/
   alembic upgrade head
   ```

5. **Create Schemas** (`backend/app/schemas/my_table.py`)

6. **Add CRUD Endpoints** (`backend/app/api/v1/endpoints/my_table.py`)

---

### Scenario 3: Modify Existing Model (Add Column)

**Files to Modify**:

1. **Update Model** (`backend/app/models/existing_model.py`)
   ```python
   # Add new column
   new_field: Mapped[str | None] = mapped_column(String(255), nullable=True)
   ```

2. **Create Migration**
   ```bash
   alembic revision --autogenerate -m "add new_field to existing_model"
   ```

3. **Review Migration** (`alembic/versions/XXX_add_new_field.py`)
   - Check column definition
   - Add default value if NOT NULL
   - Consider data migration if needed

4. **Apply Migration**
   ```bash
   alembic upgrade head
   ```

5. **Update Schemas** (`backend/app/schemas/existing_model.py`)
   - Add field to response schemas
   - Add to create/update schemas if applicable

6. **Update API Logic** (if needed)
   - Handle new field in endpoints
   - Update validation rules

---

### Scenario 4: Change RAG Chunking Strategy

**Files to Modify**:

1. **Update Chunker** (`backend/app/rag/chunker.py`)
   ```python
   class SemanticChunker:
       def __init__(self, chunk_size: int = 500, overlap: int = 50):
           # Modify chunk_size or overlap
           self.chunk_size = chunk_size  # Change to 600
           self.overlap = overlap         # Change to 100
   ```

2. **Update Configuration** (`backend/app/core/config.py`)
   ```python
   class Settings(BaseSettings):
       CHUNK_SIZE: int = Field(default=600, env="CHUNK_SIZE")
       CHUNK_OVERLAP: int = Field(default=100, env="CHUNK_OVERLAP")
   ```

3. **Reprocess Existing Documents** (if needed)
   - Create migration script to re-chunk
   - Or delete and re-upload documents

**Testing**:
- Unit test chunker with new parameters
- Test end-to-end document processing
- Verify evaluation quality with new chunks

---

### Scenario 5: Add New Document Type

**Files to Modify**:

1. **Add Enum Value** (`backend/app/core/enums.py`)
   ```python
   class DocumentType(StrEnum):
       RUBRIC = "rubric"
       NOTES = "notes"
       SAMPLE_SOLUTION = "sample_solution"
       SUBMISSION = "submission"
       MY_NEW_TYPE = "my_new_type"  # Add this
   ```

2. **Create Database Migration**
   ```bash
   alembic revision -m "add my_new_type to document_type enum"
   ```
   
   ```python
   # In migration file
   def upgrade():
       op.execute("ALTER TYPE document_type ADD VALUE 'my_new_type'")
   ```

3. **Update Retrieval Logic** (`backend/app/rag/retrieval.py`)
   ```python
   def retrieve_context(self, assignment_id: UUID, query_text: str):
       # Add retrieval for new document type
       my_new_docs = collection.query(
           query_embeddings=[embedding],
           where={"doc_type": "my_new_type"},
           n_results=10
       )
   ```

4. **Update Evaluator** (`backend/app/rag/evaluator.py`)
   - Include new document type in prompt
   - Adjust prompt template if needed

5. **Update Frontend**
   - Add upload option for new document type
   - Update TypeScript enum

---

### Scenario 6: Modify AI Evaluation Prompt

**Files to Modify**:

1. **Update Evaluator** (`backend/app/rag/evaluator.py`)
   ```python
   def _build_evaluation_prompt(
       self,
       submission_text: str,
       rubrics: List[Rubric],
       context: dict
   ) -> str:
       system_prompt = """
       You are an expert grading assistant...
       [Modify this section]
       """
       
       user_prompt = f"""
       # Assignment Submission
       {submission_text}
       
       # Grading Rubrics
       [Modify rubric formatting]
       
       # Reference Materials
       [Modify context formatting]
       """
       
       return system_prompt + user_prompt
   ```

2. **Test Changes**
   - Unit test prompt generation
   - Test with sample evaluations
   - Verify JSON parsing still works

3. **Update Fallback** (if JSON structure changes)
   ```python
   def _parse_evaluation_response(self, response_text: str) -> dict:
       # Update JSON parsing logic
       # Update fallback evaluation structure
   ```

---

### Scenario 7: Add New User Role

**Files to Modify**:

1. **Add Enum Value** (`backend/app/core/enums.py`)
   ```python
   class UserRole(StrEnum):
       PROFESSOR = "professor"
       STUDENT = "student"
       TA = "ta"
       ADMIN = "admin"
       MY_NEW_ROLE = "my_new_role"  # Add this
   ```

2. **Create Migration**
   ```bash
   alembic revision -m "add my_new_role to user_role enum"
   ```

3. **Add Dependency** (`backend/app/core/deps.py`)
   ```python
   async def get_current_my_new_role(
       current_user: User = Depends(get_current_user),
   ) -> User:
       if current_user.role != UserRole.MY_NEW_ROLE:
           raise HTTPException(status_code=403, detail="Not enough permissions")
       return current_user
   ```

4. **Add Role-Specific Endpoints**
   - Use new dependency for authorization
   - Implement role-specific business logic

5. **Update Frontend**
   - Add role to TypeScript types
   - Implement role-based UI
   - Add role selection in registration

---

### Scenario 8: Change Authentication Token Expiry

**Files to Modify**:

1. **Update Configuration** (`backend/app/core/config.py`)
   ```python
   class Settings(BaseSettings):
       ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15, env="ACCESS_TOKEN_EXPIRE_MINUTES")
       REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, env="REFRESH_TOKEN_EXPIRE_DAYS")
   ```

2. **Update Environment Variables**
   ```bash
   # .env
   ACCESS_TOKEN_EXPIRE_MINUTES=30  # Change from 15 to 30
   REFRESH_TOKEN_EXPIRE_DAYS=14    # Change from 7 to 14
   ```

3. **Update Frontend Token Refresh** (`frontend/src/lib/api.ts`)
   - Adjust refresh timing
   - Update localStorage expiry checks

---

### Scenario 9: Add File Type Support

**Files to Modify**:

1. **Update Parser** (`backend/app/rag/parsers.py`)
   ```python
   class UnifiedDocumentParser:
       def parse(self, file_path: str, mime_type: str) -> str:
           if mime_type == "application/new-type":
               return self._parse_new_type(file_path)
           # ... existing types
       
       def _parse_new_type(self, file_path: str) -> str:
           # Implement parsing logic
           ...
   ```

2. **Update Upload Validation** (`backend/app/api/v1/endpoints/uploads.py`)
   ```python
   ALLOWED_CONTENT_TYPES = {
       "application/pdf",
       "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
       "text/plain",
       "application/new-type",  # Add this
   }
   ```

3. **Add Dependencies** (`requirements.txt`)
   - Add parsing library for new file type

4. **Update Frontend**
   - Add new MIME type to upload component
   - Update file input accept attribute

---

### Scenario 10: Add Webhook Notifications

**Files to Create/Modify**:

1. **Create Service** (`backend/app/services/webhook_service.py`)
   ```python
   class WebhookService:
       async def send_notification(self, event: str, payload: dict):
           # Implementation
           ...
   ```

2. **Add Webhook Calls** (in relevant endpoints)
   ```python
   # backend/app/api/v1/endpoints/evaluations.py
   from app.services.webhook_service import WebhookService
   
   @router.post("/{evaluation_id}/approve")
   async def approve_evaluation(...):
       # ... existing logic
       
       # Send webhook
       webhook = WebhookService()
       await webhook.send_notification("evaluation.approved", {
           "evaluation_id": str(evaluation.id),
           "student_id": str(evaluation.submission.student_id),
           "score": float(evaluation.final_score)
       })
   ```

3. **Add Configuration** (`backend/app/core/config.py`)
   ```python
   WEBHOOK_URL: str | None = Field(default=None, env="WEBHOOK_URL")
   WEBHOOK_SECRET: str | None = Field(default=None, env="WEBHOOK_SECRET")
   ```

4. **Add Celery Task** (for async webhooks)
   ```python
   # backend/app/tasks/webhooks.py
   @celery_app.task(bind=True, max_retries=3)
   def send_webhook_task(self, event: str, payload: dict):
       # Implementation with retries
       ...
   ```

---

## Development Workflow

### Setting Up Development Environment

1. **Clone Repository**
   ```bash
   git clone https://github.com/yourorg/grade.ai.git
   cd grade.ai
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   # Edit .env with API URL
   ```

4. **Start Services**
   ```bash
   # From repository root
   docker-compose up -d  # PostgreSQL, Redis, MinIO, ChromaDB
   ```

5. **Run Migrations**
   ```bash
   cd backend
   alembic upgrade head
   ```

6. **Start Development Servers**
   ```bash
   # Terminal 1: Backend API
   cd backend
   uvicorn app.main:app --reload

   # Terminal 2: Celery Worker
   cd backend
   celery -A app.celery_app worker --loglevel=info

   # Terminal 3: Frontend
   cd frontend
   npm run dev
   ```

---

### Testing

**Backend Tests**:
```bash
cd backend
pytest                      # Run all tests
pytest tests/test_auth.py   # Run specific test file
pytest -v                   # Verbose output
pytest --cov               # Coverage report
```

**Frontend Tests**:
```bash
cd frontend
npm run test               # Run Vitest
npm run test:ui           # Interactive UI
npm run test:coverage     # Coverage report
```

---

## Debugging Tips

### Backend Debugging

1. **Enable Debug Logging**
   ```python
   # backend/app/core/logging.py
   structlog.configure(
       processors=[
           # ...
           structlog.dev.ConsoleRenderer(),  # Pretty console output
       ]
   )
   ```

2. **Use Debugger**
   ```python
   import debugpy
   debugpy.listen(5678)
   debugpy.wait_for_client()  # Pause until debugger attaches
   ```

3. **Check Celery Logs**
   ```bash
   # Terminal with celery worker
   # Look for task execution logs, retries, failures
   ```

4. **Inspect Database**
   ```bash
   docker exec -it gradeai-postgres psql -U postgres -d gradeai
   SELECT * FROM evaluations WHERE approval_status = 'pending';
   ```

5. **Inspect Redis**
   ```bash
   docker exec -it gradeai-redis redis-cli
   KEYS *                    # List all keys
   GET refresh:{token_jti}   # Check refresh token
   ```

### Frontend Debugging

1. **React DevTools**: Install browser extension

2. **Network Tab**: Inspect API calls

3. **Console Logging**:
   ```typescript
   console.log('API Response:', response.data);
   ```

4. **Zustand DevTools**:
   ```typescript
   import { devtools } from 'zustand/middleware';
   
   export const useAuthStore = create(devtools((set) => ({
     // ...
   })));
   ```

---

## Related Documentation

- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- **Database**: See [DATABASE.md](./DATABASE.md) for schema details
- **API Reference**: See [API.md](./API.md) for endpoint documentation
- **Workflows**: See [PROJECT_FLOW.md](./PROJECT_FLOW.md) for user journeys
- **RAG Pipeline**: See [RAG_ARCHITECTURE.md](./RAG_ARCHITECTURE.md) for AI details

---

**Last Updated**: 2026-07-11  
**Maintainers**: Development Team  
**Questions**: Open an issue on GitHub
