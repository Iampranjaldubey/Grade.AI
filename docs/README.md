# GradeAI

**AI-Powered Academic Grading Platform with RAG-based Evaluation**

GradeAI is an intelligent grading system that uses Retrieval-Augmented Generation (RAG) and Large Language Models to automatically evaluate student submissions based on rubrics, course materials, and sample solutions. The system provides consistent, detailed feedback while allowing professors to review and override AI-generated grades.

## 📋 Project Overview

GradeAI automates the grading process by:
1. Professors create courses, assignments, and detailed rubrics
2. Professors upload course materials (lecture notes, rubric documents, sample solutions)
3. Students enroll in courses and submit assignments
4. Documents are automatically processed, chunked, and embedded into a vector database
5. Upon submission, relevant context is retrieved using semantic search
6. Google Gemini evaluates the submission against rubrics and course materials
7. Professors review, approve, or override AI-generated grades
8. Students receive detailed feedback with scores, strengths, weaknesses, and missing topics

## ✨ Features

### For Professors
- **Course Management**: Create and manage multiple courses with unique join codes
- **Assignment Creation**: Define assignments with due dates, max scores, and grading modes
- **Detailed Rubrics**: Create weighted criteria with evaluation hints
- **Document Upload**: Upload lecture notes, rubric documents, and sample solutions
- **AI Review Dashboard**: Review pending evaluations sorted by confidence score
- **Grade Override**: Approve AI grades or manually override with custom scores
- **Student Analytics**: View enrolled students and submission statistics

### For Students
- **Easy Enrollment**: Join courses using professor-provided codes
- **Assignment Viewing**: See all assignments with due dates and requirements
- **Submission Upload**: Submit assignments in PDF, DOCX, or TXT format
- **Resubmission**: Update submissions before professor approval
- **Detailed Feedback**: Receive comprehensive evaluation with:
  - Per-criterion scores and reasoning
  - Identified strengths (up to 3)
  - Identified weaknesses (up to 3)
  - Missing topics that weren't addressed
  - Overall percentage and letter grade

### System Features
- **RAG Pipeline**: Semantic search retrieves relevant context for grading
- **Asynchronous Processing**: Background tasks handle document processing and evaluation
- **Vector Search**: ChromaDB enables semantic similarity matching
- **Presigned URLs**: Direct S3 uploads bypass backend for efficiency
- **Retry Mechanisms**: Automatic retry with exponential backoff for failed tasks
- **Audit Logging**: Track all significant actions (framework in place)

## 🛠 Technology Stack

### Frontend
- **React 18.3.1** with TypeScript
- **Vite 6.0.5** - Fast build tool
- **React Router 7.1.1** - Client-side routing
- **Zustand 5.0.2** - Lightweight state management
- **React Query 5.62.8** - Server state management
- **Axios 1.7.9** - HTTP client
- **React Hook Form 7.54.2** + Zod - Form validation
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library
- **React Hot Toast** - Notifications

### Backend
- **FastAPI 0.115.6** - Modern Python web framework
- **SQLAlchemy 2.0.36** - Async ORM
- **Alembic 1.14.0** - Database migrations
- **Pydantic 2.10.3** - Data validation
- **Uvicorn 0.32.1** - ASGI server

### Database & Storage
- **PostgreSQL 16** - Primary relational database
- **Redis 7** - Caching and session storage
- **ChromaDB 0.5.23** - Vector database for embeddings
- **MinIO** - S3-compatible object storage

### Task Queue
- **Celery 5.4.0** - Distributed task queue
- **Redis** - Message broker and result backend

### AI/ML
- **Google Gemini 2.0 Flash** - LLM for evaluation
- **sentence-transformers 3.0.0** - Local embedding generation
- **all-MiniLM-L6-v2** - 384-dimensional embedding model
- **PyTorch 2.6.0+cpu** - ML framework
- **pdfplumber 0.11.4** - PDF text extraction
- **python-docx 1.1.2** - DOCX parsing

### Infrastructure
- **Docker Compose** - Multi-container orchestration
- **Nginx 1.27** - Reverse proxy
- **structlog 24.4.0** - Structured logging

## 🏗 High-Level Architecture

```mermaid
graph TB
    subgraph "Client"
        Browser[React Frontend]
    end
    
    subgraph "Load Balancer"
        Nginx[Nginx Reverse Proxy]
    end
    
    subgraph "Application Layer"
        FastAPI[FastAPI Backend]
        Celery[Celery Workers]
    end
    
    subgraph "Storage Layer"
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis)]
        ChromaDB[(ChromaDB)]
        MinIO[(MinIO S3)]
    end
    
    subgraph "External Services"
        Gemini[Google Gemini API]
    end
    
    Browser -->|HTTP/HTTPS| Nginx
    Nginx -->|Proxy| FastAPI
    FastAPI -->|SQL Queries| PostgreSQL
    FastAPI -->|Cache/Session| Redis
    FastAPI -->|Queue Tasks| Celery
    FastAPI -->|Presigned URLs| MinIO
    Celery -->|Read/Write| PostgreSQL
    Celery -->|Vector Search| ChromaDB
    Celery -->|Document Storage| MinIO
    Celery -->|AI Evaluation| Gemini
    Celery -->|Task Queue| Redis
```

### Request Flow

**Synchronous Operations** (Direct API Response):
- User authentication
- Course/Assignment CRUD
- Enrollment management
- Fetching evaluations

**Asynchronous Operations** (Background Tasks):
- Document processing (parsing, chunking, embedding)
- Submission evaluation (retrieval, AI grading)

## 📸 Screenshots

*[To be added: Screenshots of professor dashboard, student view, evaluation interface]*

## 🚀 Installation

### Prerequisites
- **Docker & Docker Compose** (recommended)
- OR **Local Development**:
  - Python 3.10+
  - Node.js 18+
  - PostgreSQL 16
  - Redis 7
  - MinIO or S3-compatible storage

### Clone Repository

```bash
git clone https://github.com/your-org/gradeai.git
cd gradeai
```

## 🔧 Environment Variables

### Backend Environment (`backend/.env`)

```bash
# Application
APP_ENV=development  # development|production|test
DEBUG=true
API_V1_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql+asyncpg://gradeai:gradeai@localhost:5432/gradeai
DATABASE_URL_SYNC=postgresql://gradeai:gradeai@localhost:5432/gradeai

# Redis
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# ChromaDB
CHROMADB_HOST=localhost
CHROMADB_PORT=8001

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI APIs
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
OPENAI_API_KEY=  # Optional, not currently used

# S3/MinIO
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=gradeai-uploads
AWS_ENDPOINT_URL=http://localhost:9000  # MinIO endpoint for backend
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000  # MinIO endpoint for browser

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend Environment (`frontend/.env`)

```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 💻 Running Locally

### Option 1: Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Services Running**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- MinIO Console: http://localhost:9001
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- ChromaDB: localhost:8001

### Option 2: Local Development

#### 1. Start Infrastructure Services

```bash
# PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=gradeai \
  -e POSTGRES_PASSWORD=gradeai \
  -e POSTGRES_DB=gradeai \
  postgres:16-alpine

# Redis
docker run -d -p 6379:6379 redis:7-alpine

# ChromaDB
docker run -d -p 8001:8000 \
  -e IS_PERSISTENT=TRUE \
  chromadb/chroma:0.5.23

# MinIO
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

#### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start FastAPI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, start Celery worker
celery -A app.celery_app worker --loglevel=info
```

#### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🐳 Docker Setup

### Docker Compose Services

```yaml
services:
  postgres       # PostgreSQL 16 database
  redis          # Redis 7 cache & message broker
  chromadb       # ChromaDB vector database
  minio          # MinIO S3-compatible storage
  backend        # FastAPI application
  celery-worker  # Celery background workers
  frontend       # React application (production build)
  nginx          # Reverse proxy
```

### Build and Run

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f backend celery-worker

# Run migrations
docker-compose exec backend alembic upgrade head

# Stop services
docker-compose down

# Stop and remove volumes (DELETES DATA)
docker-compose down -v
```

### Health Checks

All services include health checks in `docker-compose.yml`:
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- ChromaDB: `/api/v1/heartbeat`
- Backend: Depends on healthy PostgreSQL, Redis, ChromaDB

## 🔄 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

**Backend**:
- Models: `backend/app/models/`
- Endpoints: `backend/app/api/v1/endpoints/`
- Services: `backend/app/services/`
- Tasks: `backend/app/tasks/`
- Schemas: `backend/app/schemas/`

**Frontend**:
- Pages: `frontend/src/pages/`
- Components: `frontend/src/components/`
- API Client: `frontend/src/lib/api.ts`
- Stores: `frontend/src/store/`

### 3. Database Changes

```bash
cd backend

# Create migration
alembic revision --autogenerate -m "Description of changes"

# Review migration file in alembic/versions/

# Apply migration
alembic upgrade head

# Rollback if needed
alembic downgrade -1
```

### 4. Test Changes

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### 5. Commit and Push

```bash
git add .
git commit -m "feat: description of changes"
git push origin feature/your-feature-name
```

## 📁 Folder Structure

```
gradeai/
├── backend/
│   ├── alembic/                 # Database migrations
│   │   └── versions/            # Migration files
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/   # API route handlers
│   │   │       └── router.py    # API router registration
│   │   ├── core/                # Configuration, security, middleware
│   │   ├── db/                  # Database session management
│   │   ├── infrastructure/      # External service clients
│   │   ├── models/              # SQLAlchemy models
│   │   ├── rag/                 # RAG pipeline components
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── services/            # Business logic layer
│   │   ├── tasks/               # Celery tasks
│   │   ├── celery_app.py        # Celery configuration
│   │   └── main.py              # FastAPI application entry
│   ├── requirements.txt         # Python dependencies
│   └── alembic.ini              # Alembic configuration
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable React components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utilities and API client
│   │   ├── pages/               # Page components
│   │   │   ├── professor/       # Professor-specific pages
│   │   │   └── student/         # Student-specific pages
│   │   ├── store/               # Zustand state management
│   │   ├── types/               # TypeScript type definitions
│   │   ├── App.tsx              # Root component
│   │   └── main.tsx             # Application entry
│   ├── package.json             # Node dependencies
│   └── vite.config.ts           # Vite configuration
├── docker/                      # Dockerfiles for services
├── nginx/                       # Nginx configuration
├── docs/                        # Technical documentation
└── docker-compose.yml           # Multi-container orchestration
```

## 🔌 API Overview

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login and receive JWT tokens
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout and blacklist tokens

### Courses (Professor)
- `POST /api/v1/courses` - Create course
- `GET /api/v1/courses` - List professor's courses
- `GET /api/v1/courses/{id}` - Get course details
- `PUT /api/v1/courses/{id}` - Update course
- `DELETE /api/v1/courses/{id}` - Soft-delete course

### Enrollments (Student)
- `POST /api/v1/enrollments/join` - Join course with code
- `GET /api/v1/enrollments/my-courses` - List enrolled courses
- `DELETE /api/v1/enrollments/{course_id}` - Drop course

### Assignments
- `POST /api/v1/assignments` - Create assignment
- `GET /api/v1/assignments?course_id={id}` - List assignments
- `GET /api/v1/assignments/{id}` - Get assignment with rubrics
- `PUT /api/v1/assignments/{id}` - Update assignment
- `DELETE /api/v1/assignments/{id}` - Soft-delete assignment

### Rubrics
- `POST /api/v1/assignments/{id}/rubrics` - Replace all rubrics
- `GET /api/v1/assignments/{id}/rubrics` - List rubrics
- `PUT /api/v1/rubrics/{id}` - Update single rubric
- `DELETE /api/v1/rubrics/{id}` - Delete rubric

### Documents
- `POST /api/v1/uploads/presign` - Get presigned upload URL
- `POST /api/v1/uploads/confirm` - Confirm upload and create document
- `GET /api/v1/uploads/{id}/status` - Check processing status
- `GET /api/v1/uploads/courses/{id}/documents` - List course documents
- `DELETE /api/v1/uploads/{id}` - Delete document

### Submissions
- `POST /api/v1/submissions` - Submit assignment
- `GET /api/v1/submissions/{assignment_id}/my-submission` - Get student's submission
- `GET /api/v1/submissions/{assignment_id}/all` - Get all submissions (professor)

### Evaluations (Professor)
- `GET /api/v1/evaluations/pending` - List pending evaluations
- `GET /api/v1/evaluations/{id}` - Get evaluation details
- `POST /api/v1/evaluations/{id}/approve` - Approve AI grade
- `POST /api/v1/evaluations/{id}/override` - Override with manual grade
- `POST /api/v1/evaluations/trigger/{submission_id}` - Manually trigger evaluation

### Evaluations (Student)
- `GET /api/v1/evaluations/submission/{id}` - View approved grade

### Health Check
- `GET /api/v1/health` - System health status

**See [API.md](./API.md) for complete endpoint documentation.**

## 🗺 Future Roadmap

### Short Term
- [ ] Email notifications for grade releases
- [ ] Bulk assignment upload
- [ ] Export grades to CSV
- [ ] Student submission history view
- [ ] Assignment templates

### Medium Term
- [ ] Plagiarism detection using submission embeddings
- [ ] TA role with limited grading permissions
- [ ] Multi-file submissions (zip upload)
- [ ] Inline code syntax highlighting
- [ ] Rubric templates library

### Long Term
- [ ] Integration with LMS (Canvas, Moodle, Blackboard)
- [ ] Custom AI model fine-tuning per professor
- [ ] Peer review workflow
- [ ] Grade appeals system
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

## 📚 Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and design decisions
- **[DATABASE.md](./DATABASE.md)** - Database schema and relationships
- **[API.md](./API.md)** - Complete API reference
- **[RAG_ARCHITECTURE.md](./RAG_ARCHITECTURE.md)** - RAG pipeline deep dive
- **[CELERY.md](./CELERY.md)** - Background task documentation
- **[CHROMADB.md](./CHROMADB.md)** - Vector database design
- **[AI_EVALUATION.md](./AI_EVALUATION.md)** - AI grading system
- **[FRONTEND.md](./FRONTEND.md)** - Frontend architecture
- **[BACKEND.md](./BACKEND.md)** - Backend structure
- **[SECURITY.md](./SECURITY.md)** - Security implementation
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[PROJECT_FLOW.md](./PROJECT_FLOW.md)** - End-to-end user flow
- **[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)** - Current limitations and improvements
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

## 🤝 Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

[Your License Here]

## 👥 Authors

[Your Team Information]

## 🙏 Acknowledgments

- Google Gemini API for LLM capabilities
- ChromaDB for vector search
- sentence-transformers for embedding generation
- FastAPI community for excellent documentation

---

**For detailed technical documentation, see the `/docs` directory.**
