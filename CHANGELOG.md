# Changelog

All notable changes to the GradeAI project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Phase 5 (Upcoming)
- Analytics dashboard with course insights
- Grade distribution visualization
- Assignment completion tracking
- Student performance trends

---

## [0.4.0] - 2026-06-11

### Added - Phase 4: AI Evaluation Engine

#### Core Features
- Complete RAG-based AI grading system using Google Gemini
- Automatic submission evaluation with rubric adherence
- Context retrieval from ChromaDB (rubrics, notes, samples)
- Professor review workflow (approve/override evaluations)
- Student grade viewing with detailed feedback
- Manual evaluation trigger for re-grading

#### New Files
- `backend/app/rag/retrieval.py` - RAG retrieval service for context gathering
- `backend/app/rag/evaluator.py` - Gemini-powered grading evaluator
- `backend/app/schemas/evaluation.py` - Evaluation schemas and request models
- `backend/app/api/v1/endpoints/evaluations.py` - Evaluation management endpoints

#### Modified Files
- `backend/app/tasks/grading.py` - Added complete `evaluate_submission` Celery task
- `backend/app/schemas/__init__.py` - Added evaluation schema exports
- `backend/app/api/v1/router.py` - Registered evaluations router (already present)

#### Documentation
- `PHASE4_IMPLEMENTATION.md` - Complete technical documentation (600+ lines)
- `PHASE4_TESTING.md` - Comprehensive testing guide with curl examples (800+ lines)
- Updated `CHANGELOG.md` with Phase 4 completion

#### Technical Details
- **Model**: Google Gemini 2.0 Flash (gemini-2.0-flash)
- **Temperature**: 0.1 (low for consistent grading)
- **Context Window**: ~4096 tokens output
- **Retrieval Strategy**:
  - Rubrics: ALL chunks (n=50) - rubric must be complete
  - Notes: Top 5 most relevant chunks via semantic search
  - Samples: Top 3 most relevant sample solution chunks
- **Evaluation Time**: 2-6 seconds per submission
- **End-to-End**: 7-26 seconds (document processing + evaluation)

#### API Endpoints
**Professor Routes**:
- `GET /api/v1/evaluations/pending` - List pending evaluations (sorted by confidence)
- `GET /api/v1/evaluations/{id}` - Get full evaluation details
- `POST /api/v1/evaluations/{id}/approve` - Approve AI grade without changes
- `POST /api/v1/evaluations/{id}/override` - Override with manual score + feedback
- `POST /api/v1/evaluations/trigger/{submission_id}` - Manually trigger evaluation

**Student Routes**:
- `GET /api/v1/evaluations/submission/{id}` - View own approved grade

#### Evaluation Features
- **Structured Output**: Total score, percentage, per-criterion breakdown
- **Detailed Feedback**: Strengths (max 3), weaknesses (max 3), missing topics
- **Confidence Score**: AI self-assessment (0.0-1.0)
- **Source Transparency**: Tracks which documents influenced grading
- **Approval Workflow**: Pending → Approved/Overridden
- **Audit Trail**: Stores retrieved_chunks for transparency

#### Error Handling
- Document not processed → retry after 60s (max 5 retries)
- Gemini API timeout → exponential backoff (60s, 120s, 240s)
- Invalid JSON response → retry once with simplified prompt
- All failures → fallback evaluation with 50% scores and manual review flag
- Missing collection → gracefully returns empty context (no crash)

#### Security Features
- Course ownership verification on all professor actions
- Students only see approved/overridden grades (not pending)
- Students only access own submissions
- Retrieved chunks logged for audit/transparency
- Professor feedback required for overrides

#### Performance
- Async Celery processing (non-blocking API)
- Efficient vector similarity search (384-dim embeddings)
- Low temperature ensures consistent output
- Token estimation for context sizing

### Dependencies
```
google-generativeai>=0.8.0 (already in requirements.txt)
```

### Changed
- Celery task `evaluate_submission` changed from stub to full implementation
- Evaluation workflow now automatic after document processing
- Submission status updates to "evaluated" after AI grading

### Fixed
- N/A (new feature implementation)

---

## [0.3.2] - 2026-06-09

### Added - Phase 3B: Document Processing Pipeline

#### Core Features
- Complete text extraction pipeline for PDF, DOCX, and TXT files
- Semantic text chunking with configurable overlap
- Local embedding generation using sentence-transformers
- ChromaDB integration for vector storage and retrieval
- Celery task for automatic document processing
- Synchronous database session for Celery tasks

#### New Files
- `backend/app/db/sync_session.py` - Sync SQLAlchemy session for Celery
- `backend/app/rag/__init__.py` - RAG package initialization
- `backend/app/rag/parsers.py` - Document text extraction (PDF/DOCX/TXT)
- `backend/app/rag/chunker.py` - Text chunking with overlap
- `backend/app/rag/embeddings.py` - Local embedding generation
- `backend/alembic/versions/004_add_processing_status.py` - Migration for PROCESSING status

#### Modified Files
- `backend/requirements.txt` - Added pdfplumber, python-docx, torch, sentence-transformers
- `backend/app/core/enums.py` - Added PROCESSING to ParseStatus enum
- `backend/app/infrastructure/chromadb_client.py` - Complete implementation with sync methods
- `backend/app/tasks/grading.py` - Complete process_document task implementation

#### Documentation
- `PHASE3B_IMPLEMENTATION.md` - Full technical documentation (400+ lines)
- `PHASE3B_TESTING.md` - Comprehensive testing guide (500+ lines)
- `PHASE3B_SUMMARY.md` - Executive summary
- `PHASE3B_README.md` - Quick start guide
- `PHASE3B_QUICK_REFERENCE.md` - One-page cheat sheet
- `PHASE3B_COMPLETE.md` - Completion summary
- Updated `PROJECT_STATUS.md` with Phase 3B completion

#### Technical Details
- **Text Extraction**: pdfplumber for PDFs, python-docx for DOCX, unicode normalization for TXT
- **Chunking**: ~500 tokens per chunk with 50 token overlap (word-based)
- **Embeddings**: all-MiniLM-L6-v2 model (384 dimensions, CPU-optimized, free)
- **Vector Storage**: ChromaDB with per-course collections
- **Processing**: Celery task with 3-retry logic and exponential backoff
- **Performance**: 1MB PDF processes in ~5s, 5MB PDF in ~20s

#### Database Changes
- Added `PROCESSING` status to `parse_status` enum
- Migration: `004_add_processing_status.py`

#### Dependencies Added
```
pdfplumber==0.11.4
python-docx==1.1.2
torch==2.6.0+cpu
sentence-transformers==3.0.0
```

### Changed
- ChromaDB client now supports both async (FastAPI) and sync (Celery) methods
- Document processing status now includes intermediate PROCESSING state
- process_document Celery task changed from stub to full implementation

### Fixed
- N/A (new feature implementation)

---

## [0.3.1] - 2026-06-09

### Added - Phase 3A: File Upload + Document Management

#### Core Features
- Complete S3/MinIO file upload system with presigned URLs
- Document management API (upload, confirm, status, delete, list)
- Submission management API (submit, view own, view all)
- File existence verification before confirming upload
- Due date validation for submissions (marks late submissions)
- Resubmission support (updates existing submission)

#### New Files
- `backend/app/services/s3_service.py` - S3/MinIO integration with boto3
- `backend/app/schemas/document.py` - Document-related schemas
- `backend/app/schemas/submission.py` - Submission-related schemas
- `backend/app/api/v1/endpoints/uploads.py` - Upload and document management
- `backend/app/api/v1/endpoints/submissions.py` - Submission management

#### Documentation
- `PHASE3A_IMPLEMENTATION.md` - Complete implementation documentation
- `PHASE3A_TESTING.md` - Testing guide with curl examples

#### Technical Details
- Presigned URLs valid for 1 hour (upload) and 24 hours (download)
- File key structure: `{course_id}/{doc_type}/{uuid}_{filename}`
- Supported MIME types: PDF, DOCX, TXT
- Access control: professors can upload rubrics/notes, students can submit
- Celery task stub: `process_document` (implemented in Phase 3B)

#### Security Features
- Content type whitelist validation
- Course access verification (enrollment or ownership)
- Professor-only document deletion
- File existence checks before creating records

---

## [0.3.0] - 2026-06-09

### Added - Phase 3: Complete Frontend Pages

#### Professor Pages
- `CourseDetailPage` with three tabs (Overview, Assignments, Students)
  - Overview: Course info, join code with copy button, stats
  - Assignments: Grid with create button, navigate to detail
  - Students: Table of enrolled students with submission counts
- `AssignmentDetailPage` with rubric builder
  - Left column: Assignment info, status, grading mode
  - Right column: Add/edit rubric criteria with weight validation
  - Weight indicator: must equal 100% (green check / red alert)
- `CreateAssignmentModal` with full form validation

#### Student Pages
- `StudentDashboard` with welcome header, stats, course preview
- `StudentCoursesPage` with course grid and join functionality
- `JoinCourseModal` reusable component

#### Design System
- Fully responsive (mobile, tablet, desktop)
- Loading skeletons with pulse animation
- Empty states with helpful CTAs
- Toast notifications for user feedback
- Consistent styling with Tailwind CSS

#### Documentation
- `PHASE3_IMPLEMENTATION.md` - Complete frontend documentation
- `PHASE3_TESTING.md` - Manual testing checklist

---

## [0.2.0] - 2026-06-08

### Added - Phase 2: Course Management System

#### Backend
- Course CRUD with automatic join code generation (6-char alphanumeric)
- Student enrollment system (join by code, drop course)
- Assignment CRUD with soft delete (is_active field)
- Rubric management with weight validation (must sum to 100%)
- List enrolled students with submission counts
- Pagination support on list endpoints

#### Database
- Migration 002: Added `join_code` to courses, `is_active` to assignments
- Migration 003: Fixed rubric weight data type

#### Frontend Foundation
- Complete TypeScript type system (no `any` types)
- API client with automatic token refresh on 401
- Zustand auth store with localStorage persistence
- Tailwind CSS with custom theme (navy #1E3A5F, blue #2E86AB)
- React Query for server state management
- React Hook Form + Zod validation
- Professor Dashboard and Course List Page
- Create Course Modal

#### Documentation
- `IMPLEMENTATION_SUMMARY.md` - Detailed feature documentation
- `phase2-courses.md` - Phase 2 specifications

---

## [0.1.0] - 2026-06-07

### Added - Phase 1: Authentication System

#### Backend
- User registration with role selection (Professor/Student/TA/Admin)
- JWT-based authentication with access + refresh tokens
- Automatic token refresh mechanism
- Token blacklisting on logout (Redis)
- Protected API endpoints with role-based access control
- Password hashing with argon2

#### Frontend
- Login page with email/password and show/hide toggle
- Registration page with role selector (Professor/Student cards)
- Protected routes with role verification
- Auth state persistence across page reloads
- Toast notifications for errors
- Auto-redirect based on role

#### Infrastructure
- PostgreSQL database with initial schema (migration 001)
- Redis for token management
- FastAPI backend with async endpoints
- React + TypeScript frontend with Vite
- Docker Compose setup for local development

#### Documentation
- `README.md` - Project overview and quick start
- `.env.example` - Environment variable template
- API documentation via FastAPI automatic docs

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

---

## Version Numbering

- **0.1.0** - Phase 1: Authentication
- **0.2.0** - Phase 2: Course Management
- **0.3.0** - Phase 3: Frontend Pages
- **0.3.1** - Phase 3A: File Upload
- **0.3.2** - Phase 3B: Document Processing
- **0.4.0** - Phase 4: Grading (upcoming)
- **0.5.0** - Phase 5: Analytics (upcoming)
- **1.0.0** - Production Release (upcoming)
