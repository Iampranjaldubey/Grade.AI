# System Architecture

**GradeAI High-Level Architecture and Design Decisions**

## Table of Contents

1. [Overview](#overview)
2. [System Architecture Diagram](#system-architecture-diagram)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Layer](#database-layer)
6. [Celery Task Queue](#celery-task-queue)
7. [Redis](#redis)
8. [ChromaDB Vector Database](#chromadb-vector-database)
9. [MinIO Object Storage](#minio-object-storage)
10. [Google Gemini AI](#google-gemini-ai)
11. [Service Communication](#service-communication)
12. [Deployment Architecture](#deployment-architecture)
13. [Technology Choices](#technology-choices)
14. [Design Patterns](#design-patterns)
15. [Security Architecture](#security-architecture)

## Overview

GradeAI is a distributed web application built on a microservices-inspired architecture. The system separates concerns into distinct layers:

- **Presentation**: React SPA (Single Page Application)
- **API**: FastAPI REST backend
- **Task Processing**: Celery distributed task queue
- **Data Storage**: PostgreSQL (relational), ChromaDB (vector), MinIO (object)
- **Caching**: Redis
- **AI**: Google Gemini API

### Architectural Principles

1. **Separation of Concerns**: Each service has a single, well-defined responsibility
2. **Asynchronous Processing**: Long-running tasks execute in background workers
3. **Scalability**: Stateless services enable horizontal scaling
4. **Fault Tolerance**: Retry mechanisms and graceful degradation
5. **Data Locality**: Keep related data close (course → collection mapping)


## System Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[React SPA<br/>Port 3000]
    end
    
    subgraph "Gateway Layer"
        Nginx[Nginx Reverse Proxy<br/>Port 80]
    end
    
    subgraph "Application Layer"
        FastAPI[FastAPI Backend<br/>Port 8000<br/>Uvicorn ASGI]
        Celery[Celery Workers<br/>Background Processing]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL 16<br/>Port 5432<br/>Primary Database)]
        Redis[(Redis 7<br/>Port 6379<br/>Cache & Broker)]
        Chroma[(ChromaDB<br/>Port 8001<br/>Vector Store)]
        MinIO[(MinIO<br/>Port 9000<br/>S3-Compatible)]
    end
    
    subgraph "External Services"
        Gemini[Google Gemini API<br/>generativelanguage.googleapis.com]
    end
    
    Browser -->|HTTP/HTTPS| Nginx
    Nginx -->|/| Browser
    Nginx -->|/api| FastAPI
    
    FastAPI -->|SQL| PG
    FastAPI -->|Cache| Redis
    FastAPI -->|Queue Tasks| Redis
    FastAPI -->|Presigned URLs| MinIO
    
    Celery -->|Tasks| Redis
    Celery -->|SQL| PG
    Celery -->|Download Files| MinIO
    Celery -->|Store Vectors| Chroma
    Celery -->|API Calls| Gemini
    
    style Browser fill:#e1f5ff
    style Nginx fill:#ffe6e6
    style FastAPI fill:#e6ffe6
    style Celery fill:#fff4e6
    style PG fill:#f0e6ff
    style Redis fill:#ffe6f0
    style Chroma fill:#e6f7ff
    style MinIO fill:#fff7e6
    style Gemini fill:#ffebe6
```

### Data Flow Types

**Synchronous Operations** (FastAPI → Client):
- Authentication
- Course CRUD
- Assignment CRUD
- Enrollment management
- Fetching evaluations

**Asynchronous Operations** (FastAPI → Celery → Client polls):
- Document processing
- Submission evaluation


## Frontend Architecture

### Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.2 | Type safety |
| Vite | 6.0.5 | Build tool & dev server |
| React Router | 7.1.1 | Client-side routing |
| Zustand | 5.0.2 | State management |
| React Query | 5.62.8 | Server state & caching |
| Axios | 1.7.9 | HTTP client |
| React Hook Form | 7.54.2 | Form management |
| Zod | 3.24.1 | Schema validation |
| Tailwind CSS | 3.4.17 | Styling |

### Frontend Architecture Diagram

```mermaid
graph TB
    subgraph "Browser"
        App[App.tsx<br/>Root Component]
        Router[React Router<br/>Route Management]
        
        subgraph "Pages"
            ProfPages[Professor Pages<br/>Dashboard, Courses, Assignments]
            StudPages[Student Pages<br/>Courses, Submissions]
            AuthPages[Auth Pages<br/>Login, Register]
        end
        
        subgraph "State Management"
            Zustand[Zustand Store<br/>Auth State]
            ReactQuery[React Query<br/>Server State Cache]
        end
        
        subgraph "API Layer"
            AxiosClient[Axios Client<br/>HTTP Interceptors]
            APIFunctions[API Functions<br/>Typed Requests]
        end
        
        subgraph "Components"
            Shared[Shared Components<br/>Button, Modal, Form]
            Prof[Professor Components<br/>RubricForm, EvalReview]
            Stud[Student Components<br/>SubmissionUpload]
        end
    end
    
    App --> Router
    Router --> ProfPages
    Router --> StudPages
    Router --> AuthPages
    
    ProfPages --> Zustand
    ProfPages --> ReactQuery
    StudPages --> Zustand
    StudPages --> ReactQuery
    
    ReactQuery --> APIFunctions
    APIFunctions --> AxiosClient
    AxiosClient -->|HTTP| Backend[FastAPI Backend]
    
    ProfPages --> Shared
    ProfPages --> Prof
    StudPages --> Shared
    StudPages --> Stud
```

### Directory Structure

```
frontend/src/
├── components/           # Reusable UI components
│   ├── ui/              # Base components (Button, Input, Modal)
│   ├── professor/       # Professor-specific components
│   └── student/         # Student-specific components
├── pages/               # Page-level components
│   ├── professor/       # Professor dashboard, courses, etc.
│   ├── student/         # Student dashboard, submissions, etc.
│   ├── LoginPage.tsx
│   └── RegisterPage.tsx
├── store/               # Zustand stores
│   └── authStore.ts     # Authentication state
├── lib/                 # Utilities
│   ├── api.ts           # Axios instance & API functions
│   └── utils.ts         # Helper functions
├── types/               # TypeScript type definitions
│   └── api.ts           # API response types
├── hooks/               # Custom React hooks
│   └── useAuth.ts       # Authentication hook
├── App.tsx              # Root component with routing
└── main.tsx             # Application entry point
```

### State Management Strategy

**Zustand** (Client State):
- User authentication state
- UI state (modals, sidebars)
- Lightweight, minimal boilerplate

```typescript
// Example: authStore.ts
interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, token) => set({ user, accessToken: token }),
  clearAuth: () => set({ user: null, accessToken: null }),
}));
```

**React Query** (Server State):
- API data caching
- Background refetching
- Optimistic updates
- Stale-while-revalidate pattern

```typescript
// Example: Fetching courses
const { data: courses, isLoading } = useQuery({
  queryKey: ['courses'],
  queryFn: () => api.getCourses(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### Routing Structure

**File**: `frontend/src/App.tsx`

```typescript
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  
  {/* Protected routes */}
  <Route element={<ProtectedRoute />}>
    {/* Professor routes */}
    <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
    <Route path="/professor/courses" element={<CoursesPage />} />
    <Route path="/professor/courses/:id" element={<CourseDetailPage />} />
    <Route path="/professor/assignments/:id" element={<AssignmentDetailPage />} />
    
    {/* Student routes */}
    <Route path="/student/dashboard" element={<StudentDashboard />} />
    <Route path="/student/courses" element={<StudentCoursesPage />} />
    <Route path="/student/assignments/:id" element={<StudentAssignmentPage />} />
  </Route>
</Routes>
```

### API Client

**File**: `frontend/src/lib/api.ts`

```typescript
// Axios instance with interceptors
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add JWT token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle 401, refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Attempt token refresh
      // Redirect to login if refresh fails
    }
    return Promise.reject(error);
  }
);
```

### Build Configuration

**File**: `frontend/vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react'],
        },
      },
    },
  },
});
```

### Why These Choices

**React over Vue/Angular**:
- Largest ecosystem
- Excellent TypeScript support
- Flexible architecture

**Vite over CRA**:
- 10-100x faster dev server
- Optimized production builds
- Native ESM support

**Zustand over Redux**:
- Minimal boilerplate (no actions/reducers)
- Better TypeScript inference
- Smaller bundle size (~1KB vs ~10KB)

**React Query over Manual Fetching**:
- Built-in caching
- Automatic refetching
- Optimistic updates
- Reduces backend load


## Backend Architecture

### Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| FastAPI | 0.115.6 | Web framework |
| Starlette | 0.41.3 | ASGI toolkit |
| Uvicorn | 0.32.1 | ASGI server |
| SQLAlchemy | 2.0.36 | ORM (async) |
| Alembic | 1.14.0 | Database migrations |
| Pydantic | 2.10.3 | Data validation |
| asyncpg | 0.30.0 | PostgreSQL async driver |
| psycopg2-binary | 2.9.10 | PostgreSQL sync driver |
| python-jose | 3.3.0 | JWT handling |
| argon2-cffi | 23.1.0 | Password hashing |
| structlog | 24.4.0 | Structured logging |

### Backend Architecture Diagram

```mermaid
graph TB
    subgraph "FastAPI Application"
        Main[main.py<br/>Application Entry]
        
        subgraph "API Layer"
            Router[API Router<br/>v1/router.py]
            Endpoints[Endpoints<br/>courses, assignments, etc.]
        end
        
        subgraph "Business Logic"
            Services[Services<br/>s3_service, user_service]
        end
        
        subgraph "Data Access"
            Models[SQLAlchemy Models<br/>User, Course, etc.]
            Schemas[Pydantic Schemas<br/>Request/Response]
        end
        
        subgraph "Core"
            Config[Configuration<br/>Settings]
            Security[Security<br/>JWT, Password Hash]
            Deps[Dependencies<br/>DB Session, Auth]
            Middleware[Middleware<br/>CORS, Request ID]
        end
        
        subgraph "RAG System"
            Parsers[Document Parsers<br/>PDF, DOCX, TXT]
            Chunker[Text Chunker]
            Embeddings[Embedding Service]
            Retrieval[Retrieval Service]
            Evaluator[Grading Evaluator]
        end
    end
    
    Main --> Router
    Main --> Middleware
    Main --> Config
    
    Router --> Endpoints
    Endpoints --> Deps
    Endpoints --> Services
    Endpoints --> Models
    Endpoints --> Schemas
    
    Deps --> Security
    Deps --> Models
    
    Services --> Models
    
    RAG[Celery Tasks] --> Parsers
    RAG --> Chunker
    RAG --> Embeddings
    RAG --> Retrieval
    RAG --> Evaluator
```

### Directory Structure

```
backend/app/
├── main.py                      # Application entry point
├── celery_app.py               # Celery configuration
├── api/                        # API routes
│   └── v1/
│       ├── router.py           # API router registration
│       └── endpoints/          # Route handlers
│           ├── auth.py
│           ├── courses.py
│           ├── assignments.py
│           ├── submissions.py
│           ├── evaluations.py
│           ├── uploads.py
│           └── health.py
├── core/                       # Core functionality
│   ├── config.py              # Settings management
│   ├── deps.py                # Dependency injection
│   ├── security.py            # JWT, password hashing
│   ├── enums.py               # Application enums
│   ├── exceptions.py          # Custom exceptions
│   ├── handlers.py            # Exception handlers
│   ├── middleware.py          # Custom middleware
│   └── lifespan.py            # Startup/shutdown
├── db/                         # Database layer
│   ├── base.py                # Import all models
│   ├── session.py             # Async session factory
│   ├── sync_session.py        # Sync session for Celery
│   └── types.py               # Custom column types
├── models/                     # SQLAlchemy models
│   ├── user.py
│   ├── course.py
│   ├── assignment.py
│   ├── rubric.py
│   ├── document.py
│   ├── document_chunk.py
│   ├── submission.py
│   ├── evaluation.py
│   ├── enrollment.py
│   ├── audit_log.py
│   └── mixins.py              # Reusable model mixins
├── schemas/                    # Pydantic schemas
│   ├── course.py
│   ├── assignment.py
│   ├── submission.py
│   ├── evaluation.py
│   ├── document.py
│   └── health.py
├── services/                   # Business logic
│   ├── s3_service.py          # MinIO/S3 operations
│   └── user_service.py        # User operations
├── infrastructure/             # External service clients
│   ├── chromadb_client.py     # ChromaDB operations
│   └── redis_client.py        # Redis connection
├── rag/                        # RAG pipeline
│   ├── parsers.py             # Document parsing
│   ├── chunker.py             # Text chunking
│   ├── embeddings.py          # Embedding generation
│   ├── retrieval.py           # Context retrieval
│   └── evaluator.py           # Gemini evaluation
└── tasks/                      # Celery tasks
    └── grading.py             # Background tasks
```

### Application Initialization

**File**: `backend/app/main.py`

```python
def create_app() -> FastAPI:
    settings = get_settings()
    
    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="GradeAI — AI-assisted grading platform API",
        docs_url="/docs" if not settings.is_production else None,
        lifespan=lifespan,  # Startup/shutdown events
    )
    
    # Store settings in app state
    application.state.settings = settings
    
    # Add middleware
    application.add_middleware(CORSMiddleware, ...)
    application.add_middleware(AccessLogMiddleware)
    application.add_middleware(RequestIDMiddleware, settings=settings)
    
    # Register exception handlers
    register_exception_handlers(application)
    
    # Include API routes
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    
    return application

app = create_app()
```

### Lifespan Events

**File**: `backend/app/core/lifespan.py`

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = app.state.settings
    
    # Initialize database pool
    await init_db_pool(settings)
    
    # Connect to Redis
    await redis_manager.connect(settings.redis_url)
    
    # Health check ChromaDB
    chroma_client = get_chromadb_client(settings)
    await chroma_client.ping()
    
    logger.info("application_started")
    
    yield
    
    # Shutdown
    await close_db_pool()
    await redis_manager.close()
    await chroma_client.close()
    
    logger.info("application_stopped")
```

### Dependency Injection

**File**: `backend/app/core/deps.py`

```python
# Database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session

# Redis connection
async def get_redis() -> Redis:
    return redis_manager.client

# Current authenticated user
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    
    # Check token blacklist
    jti = payload.get("jti")
    if await redis.exists(f"blacklist:{jti}"):
        raise HTTPException(401, "Token has been revoked")
    
    # Fetch user
    user_id = payload.get("sub")
    user = await db.get(User, uuid.UUID(user_id))
    
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    
    return user

# Role-based access
async def require_professor(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.PROFESSOR:
        raise HTTPException(403, "Professor role required")
    return current_user
```

### Request/Response Flow

```mermaid
sequenceDiagram
    participant Client
    participant Middleware
    participant Endpoint
    participant Deps
    participant Service
    participant Model
    participant DB
    
    Client->>Middleware: HTTP Request
    Middleware->>Middleware: Add Request ID
    Middleware->>Middleware: CORS Check
    Middleware->>Endpoint: Route to Handler
    Endpoint->>Deps: Inject Dependencies
    Deps->>DB: Get DB Session
    Deps->>Model: Authenticate User
    Endpoint->>Service: Business Logic
    Service->>Model: Query/Mutate Data
    Model->>DB: SQL Operations
    DB-->>Model: Results
    Model-->>Service: Domain Objects
    Service-->>Endpoint: Service Response
    Endpoint-->>Middleware: Pydantic Schema
    Middleware-->>Client: JSON Response
```

### Why These Choices

**FastAPI over Flask/Django**:
- Async/await support (better concurrency)
- Automatic OpenAPI docs
- Built-in validation (Pydantic)
- Better performance (Starlette)
- Modern Python features

**SQLAlchemy 2.0 over Django ORM**:
- Async support
- More flexible queries
- Better type hints
- Framework-agnostic

**Pydantic v2 over Marshmallow**:
- Better performance (Rust core)
- Excellent TypeScript generation
- FastAPI integration
- Clear validation errors

**Uvicorn over Gunicorn**:
- ASGI support (async)
- Better WebSocket support
- Lower latency


## Database Layer

### PostgreSQL 16

**Purpose**: Primary relational database for structured data

**Configuration**:
- **Connection Pool**: 10 connections, 20 max overflow
- **Driver**: asyncpg (async), psycopg2 (sync for Celery)
- **Pre-ping**: Enabled (validates connections before use)

### Database Architecture

```mermaid
graph TB
    subgraph "Database Layer"
        Models[SQLAlchemy Models]
        AsyncSession[Async Session Factory]
        SyncSession[Sync Session Factory]
        Alembic[Alembic Migrations]
    end
    
    subgraph "Consumers"
        FastAPI[FastAPI Endpoints]
        Celery[Celery Workers]
    end
    
    FastAPI --> AsyncSession
    AsyncSession --> Models
    Models --> PostgreSQL[(PostgreSQL 16)]
    
    Celery --> SyncSession
    SyncSession --> Models
    
    Alembic --> PostgreSQL
```

### Schema Overview

**10 Core Tables**:
1. `users` - Professors and students
2. `courses` - Course definitions
3. `enrollments` - Student course registrations
4. `assignments` - Assignment definitions
5. `rubrics` - Grading criteria
6. `documents` - Uploaded files metadata
7. `document_chunks` - Text chunks for RAG
8. `submissions` - Student submissions
9. `evaluations` - AI grading results
10. `audit_logs` - System audit trail

**See [DATABASE.md](./DATABASE.md) for complete schema documentation.**

### Migration Strategy

**File**: `backend/alembic.ini`

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql://gradeai:gradeai@localhost:5432/gradeai
```

**Commands**:
```bash
# Create migration
alembic revision --autogenerate -m "Add new column"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# Show current version
alembic current
```

### Connection Management

**Async Session** (FastAPI):
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

**Sync Session** (Celery):
```python
@contextmanager
def get_sync_db() -> Generator[Session, None, None]:
    SessionLocal = get_sync_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

### Why PostgreSQL

| Reason | Benefit |
|--------|---------|
| **ACID Compliance** | Data integrity for grades |
| **JSONB Support** | Flexible storage for feedback, metadata |
| **Full-Text Search** | Course/assignment search (future) |
| **Mature Ecosystem** | Extensive tooling, monitoring |
| **Performance** | Efficient indexing, query optimization |
| **Extensions** | pgcrypto for UUID generation |


## Celery Task Queue

### Architecture

```mermaid
graph LR
    FastAPI[FastAPI<br/>Producer] -->|Queue Task| RedisBroker[(Redis DB 1<br/>Message Broker)]
    RedisBroker -->|Dispatch| Worker1[Celery Worker 1]
    RedisBroker -->|Dispatch| Worker2[Celery Worker 2]
    RedisBroker -->|Dispatch| Worker3[Celery Worker N]
    
    Worker1 -->|Store Result| RedisResult[(Redis DB 2<br/>Result Backend)]
    Worker2 -->|Store Result| RedisResult
    Worker3 -->|Store Result| RedisResult
    
    Worker1 -->|Query/Update| PostgreSQL[(PostgreSQL)]
    Worker1 -->|Vector Ops| ChromaDB[(ChromaDB)]
    Worker1 -->|Download Files| MinIO[(MinIO)]
    Worker1 -->|API Calls| Gemini[Gemini API]
```

### Configuration

**File**: `backend/app/celery_app.py`

```python
from celery import Celery

settings = get_settings()

celery_app = Celery(
    "gradeai",
    broker=settings.celery_broker_url,      # redis://localhost:6379/1
    backend=settings.celery_result_backend,  # redis://localhost:6379/2
    include=["app.tasks.grading"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,      # Track task state
    task_acks_late=True,          # Acknowledge after completion
    worker_prefetch_multiplier=1, # Fetch one task at a time
)
```

### Task Definitions

**File**: `backend/app/tasks/grading.py`

**Two Primary Tasks**:

1. **`process_document(document_id)`**
   - Parse uploaded document
   - Chunk text
   - Generate embeddings
   - Store in PostgreSQL + ChromaDB
   - **Retry**: 3 attempts with exponential backoff (30s, 60s, 120s)

2. **`evaluate_submission(submission_id)`**
   - Retrieve context from ChromaDB
   - Call Gemini API for grading
   - Parse JSON response
   - Store evaluation in PostgreSQL
   - **Retry**: 3 attempts with exponential backoff (60s, 120s, 240s)

### Task Flow

```mermaid
sequenceDiagram
    participant API as FastAPI
    participant Broker as Redis Broker
    participant Worker as Celery Worker
    participant Result as Redis Result
    
    API->>Broker: task.delay(args)
    API-->>Client: {"task_id": "abc123"}
    
    Broker->>Worker: Dispatch Task
    Worker->>Worker: Execute Task
    
    alt Success
        Worker->>Result: Store Result
        Worker->>Broker: ACK
    else Failure
        Worker->>Worker: Retry Logic
        alt Max Retries Exceeded
            Worker->>Result: Store Error
            Worker->>Broker: ACK
        else Retry
            Worker->>Broker: Requeue with Delay
        end
    end
    
    Client->>API: GET /status/{task_id}
    API->>Result: Get Result
    Result-->>API: Task State
    API-->>Client: {"status": "success"}
```

### Task Execution

**Starting Worker**:
```bash
celery -A app.celery_app worker --loglevel=info
```

**Production (multiple workers)**:
```bash
celery -A app.celery_app worker --loglevel=info --concurrency=4
```

### Task Monitoring

**Check Active Tasks**:
```bash
celery -A app.celery_app inspect active
```

**Check Registered Tasks**:
```bash
celery -A app.celery_app inspect registered
```

**Purge Queue**:
```bash
celery -A app.celery_app purge
```

### Why Celery

| Reason | Benefit |
|--------|---------|
| **Battle-Tested** | Used by millions of applications |
| **Scalable** | Add workers without code changes |
| **Reliable** | Task acknowledgment, retries |
| **Flexible** | Supports multiple brokers (Redis, RabbitMQ) |
| **Monitoring** | Flower dashboard available |
| **Scheduling** | Celery Beat for periodic tasks (future) |

**See [CELERY.md](./CELERY.md) for detailed task documentation.**


## Redis

### Multi-Database Architecture

```mermaid
graph TB
    subgraph "Redis Instance"
        DB0[Database 0<br/>Application Cache<br/>Session Storage]
        DB1[Database 1<br/>Celery Broker<br/>Task Queue]
        DB2[Database 2<br/>Celery Results<br/>Task State]
    end
    
    FastAPI1[FastAPI] -->|Cache| DB0
    FastAPI1 -->|Queue Tasks| DB1
    FastAPI2[FastAPI] -->|Get Results| DB2
    
    CeleryWorker[Celery Worker] -->|Fetch Tasks| DB1
    CeleryWorker -->|Store Results| DB2
```

### Configuration

**Redis 7 Alpine** (Docker):
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
```

### Database Usage

| Database | Purpose | Data Type | TTL |
|----------|---------|-----------|-----|
| **DB 0** | Application cache, JWT blacklist | String, Hash | Variable |
| **DB 1** | Celery message broker (task queue) | List | Auto-expire |
| **DB 2** | Celery result backend (task state) | String (JSON) | 24 hours |

### Cache Strategy

**JWT Token Blacklist** (DB 0):
```python
# Logout: Blacklist access token
jti = payload.get("jti")  # JWT ID
expiry = payload.get("exp") - int(time.time())
await redis.setex(f"blacklist:{jti}", expiry, "1")

# Authentication: Check blacklist
if await redis.exists(f"blacklist:{jti}"):
    raise HTTPException(401, "Token has been revoked")
```

**Future: API Response Caching**:
```python
# Not currently implemented, but pattern for future:
cache_key = f"courses:user:{user_id}"
cached = await redis.get(cache_key)
if cached:
    return json.loads(cached)

courses = await fetch_courses_from_db(user_id)
await redis.setex(cache_key, 300, json.dumps(courses))  # 5 min TTL
```

### Persistence

**AOF (Append-Only File)**: Enabled
- Writes every operation to disk
- Survives crashes
- Can rebuild dataset from log

**RDB Snapshots**: Default Redis behavior
- Periodic snapshots to disk
- Faster recovery than AOF

### Why Redis

| Reason | Benefit |
|--------|---------|
| **In-Memory Speed** | Microsecond latency |
| **Multiple Data Structures** | Lists, Sets, Hashes, Sorted Sets |
| **Pub/Sub Support** | Real-time features (future) |
| **Persistence Options** | AOF, RDB |
| **Celery Integration** | Official broker/backend |
| **Lightweight** | ~10MB memory footprint |


## ChromaDB Vector Database

### Architecture

```mermaid
graph TB
    subgraph "ChromaDB Server"
        HTTP[HTTP API<br/>Port 8001]
        Collections[Collections<br/>gradeai_{course_id}]
        Vectors[Vector Index<br/>HNSW]
        Metadata[Metadata Store<br/>SQLite]
    end
    
    CeleryWorker[Celery Worker] -->|Add Chunks| HTTP
    RetrievalService[Retrieval Service] -->|Query| HTTP
    
    HTTP --> Collections
    Collections --> Vectors
    Collections --> Metadata
    
    Disk[Persistent Storage<br/>/chroma/chroma] --> Collections
```

### Configuration

**ChromaDB 0.5.23** (Docker):
```yaml
chromadb:
  image: chromadb/chroma:0.5.23
  environment:
    IS_PERSISTENT: "TRUE"
    ANONYMIZED_TELEMETRY: "FALSE"
  ports:
    - "8001:8000"
  volumes:
    - chroma_data:/chroma/chroma
```

### Collection Design

**Naming**: `gradeai_{course_uuid}`

**One Collection Per Course** (not per assignment):
- Lecture notes shared across assignments
- Efficient metadata filtering
- Reduces collection sprawl

**Example Collections**:
```
gradeai_123e4567-e89b-12d3-a456-426614174000  (CS101)
gradeai_987f6543-e21b-12d3-a456-426614174111  (MATH201)
gradeai_abc12345-e89b-12d3-a456-426614174222  (PHYS301)
```

### Data Storage

**Per Chunk**:
```json
{
  "id": "embedding-uuid",
  "document": "chunk text",
  "embedding": [0.123, -0.456, 0.789, ...],  // 384 floats
  "metadata": {
    "document_id": "doc-uuid",
    "doc_type": "notes|rubric|sample_solution|submission",
    "course_id": "course-uuid",
    "assignment_id": "assignment-uuid-or-empty",
    "chunk_index": 0
  }
}
```

### Vector Index

**Algorithm**: HNSW (Hierarchical Navigable Small World)
- Approximate nearest neighbor search
- Trade accuracy for speed
- O(log n) query time

**Distance Metric**: Cosine distance (default)
- Range: [0, 2]
- 0 = identical
- Lower = more similar

### Client Integration

**File**: `backend/app/infrastructure/chromadb_client.py`

```python
class ChromaDBClient:
    def __init__(self, settings: Settings):
        self._client = chromadb.HttpClient(
            host=settings.chromadb_host,
            port=settings.chromadb_port,
        )
    
    def get_or_create_collection(self, course_id: UUID):
        collection_name = f"gradeai_{str(course_id)}"
        return self._client.get_or_create_collection(
            name=collection_name,
            metadata={"course_id": str(course_id)},
        )
    
    def add_chunks(self, collection_name, chunks, embeddings, metadatas, ids):
        collection = self._client.get_collection(collection_name)
        collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
    
    def query(self, collection_name, query_embedding, n_results, where_filter):
        collection = self._client.get_collection(collection_name)
        return collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_filter,
        )
```

### Query Filtering

**Metadata Filters** (ChromaDB syntax):

**Single condition**:
```python
where_filter = {"doc_type": "notes"}
```

**Multiple conditions** (requires $and):
```python
where_filter = {
    "$and": [
        {"doc_type": "rubric"},
        {"assignment_id": "abc123..."}
    ]
}
```

### Why ChromaDB

| Reason | Benefit |
|--------|---------|
| **Open Source** | No vendor lock-in |
| **Lightweight** | Python-native, easy deployment |
| **HTTP API** | Language-agnostic |
| **Persistent** | Data survives restarts |
| **Metadata Filtering** | Filter before similarity search |
| **Active Development** | Regular updates |

**Alternatives Considered**:
- **Pinecone**: Cloud-only, cost-prohibitive
- **Weaviate**: More complex, overkill for use case
- **Qdrant**: Rust-based, harder to debug
- **FAISS**: No built-in metadata filtering

**See [CHROMADB.md](./CHROMADB.md) for detailed documentation.**


## MinIO Object Storage

### Architecture

```mermaid
graph TB
    subgraph "MinIO Server"
        API[S3-Compatible API<br/>Port 9000]
        Console[Web Console<br/>Port 9001]
        Buckets[Buckets<br/>gradeai-uploads]
    end
    
    Browser[Browser] -->|Presigned URL| API
    FastAPI[FastAPI] -->|Generate URLs| API
    CeleryWorker[Celery Worker] -->|Download Files| API
    
    API --> Buckets
    Console --> Buckets
    
    Disk[Persistent Storage<br/>/data] --> Buckets
```

### Configuration

**MinIO** (Docker):
```yaml
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"  # S3 API
    - "9001:9001"  # Web Console
  volumes:
    - minio_data:/data
```

### Bucket Structure

```
gradeai-uploads/
├── {course-id}/
│   ├── notes/
│   │   ├── {uuid}_lecture1.pdf
│   │   ├── {uuid}_lecture2.docx
│   │   └── ...
│   ├── rubric/
│   │   ├── {uuid}_hw1_rubric.pdf
│   │   └── ...
│   ├── sample_solution/
│   │   ├── {uuid}_hw1_solution.pdf
│   │   └── ...
│   └── submission/
│       ├── {uuid}_student1_hw1.pdf
│       ├── {uuid}_student2_hw1.docx
│       └── ...
└── ...
```

### Presigned URL Flow

**Two-Phase Upload**:

1. **Backend generates presigned upload URL**:
```python
# FastAPI endpoint
file_key = f"{course_id}/notes/{uuid}_{file_name}"
upload_url = s3_service.generate_presigned_upload_url(
    file_key=file_key,
    content_type="application/pdf",
    expires=3600,  # 1 hour
)
# Returns: http://localhost:9000/gradeai-uploads/...?X-Amz-Algorithm=...
```

2. **Browser uploads directly to MinIO**:
```javascript
// Frontend
await fetch(upload_url, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'application/pdf'
  }
});
```

3. **Backend generates presigned download URL**:
```python
download_url = s3_service.generate_presigned_download_url(
    file_key=file_key,
    expires=86400,  # 24 hours
)
```

### S3Service Implementation

**File**: `backend/app/services/s3_service.py`

```python
class S3Service:
    def __init__(self, settings: Settings):
        # Internal endpoint for backend
        internal_endpoint = settings.aws_endpoint_url
        
        # Public endpoint for browser (presigned URLs)
        public_endpoint = settings.aws_s3_public_endpoint or internal_endpoint
        
        # Client for backend operations
        self._client = boto3.client(
            "s3",
            endpoint_url=internal_endpoint,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
        )
        
        # Separate client for presigned URLs
        self._presign_client = boto3.client(
            "s3",
            endpoint_url=public_endpoint,  # Browser-accessible endpoint
            ...
        )
    
    def generate_presigned_upload_url(self, file_key, content_type, expires):
        return self._presign_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": file_key, "ContentType": content_type},
            ExpiresIn=expires,
        )
```

### Dual-Endpoint Design

**Why Two Endpoints**:
- **Internal** (`http://minio:9000`): Backend → MinIO (Docker network)
- **Public** (`http://localhost:9000`): Browser → MinIO (host network)

**Problem Without This**:
- Presigned URLs signed for `http://minio:9000`
- Browser cannot resolve `minio` hostname
- Upload fails with DNS error

**Solution**:
- Sign presigned URLs with `http://localhost:9000`
- Browser can access MinIO
- Backend still uses internal hostname

### File Operations

**Upload Flow**:
1. Client requests presigned URL
2. Client uploads directly to MinIO
3. Client confirms upload
4. Backend verifies file exists
5. Backend creates Document record

**Download Flow**:
1. Backend generates presigned download URL
2. Client downloads directly from MinIO

**Delete Flow**:
1. Backend deletes from MinIO
2. Backend deletes Document record

### Why MinIO

| Reason | Benefit |
|--------|---------|
| **S3 Compatible** | Use same code for AWS S3 in production |
| **Self-Hosted** | No data leaves infrastructure |
| **No Egress Costs** | Unlike AWS S3 |
| **Docker Native** | Easy local development |
| **Web Console** | GUI for debugging |
| **Performance** | Local storage, low latency |

**Production Alternative**: AWS S3 (same code, change endpoint)


## Google Gemini AI

### Architecture

```mermaid
graph LR
    Worker[Celery Worker] -->|HTTP POST| Gemini[Google Gemini API<br/>generativelanguage.googleapis.com]
    Gemini -->|JSON Response| Worker
    
    Worker -->|API Key| Gemini
    Worker -->|Prompt + Context| Gemini
```

### Configuration

**Environment Variables**:
```bash
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.0-flash
```

### Model Selection

**Gemini 2.0 Flash**:
- **Purpose**: Fast, cost-effective LLM
- **Context Window**: 1M tokens
- **Output Limit**: 8K tokens
- **Pricing**: $0.075 per 1M input tokens, $0.30 per 1M output tokens
- **Latency**: ~2-5 seconds per request

**Why Flash over Pro**:
- 3x faster
- 10x cheaper
- Sufficient quality for grading task
- 1M token window handles all context

**Alternatives Considered**:
- **GPT-4**: More expensive ($10 per 1M tokens)
- **Claude**: No structured output API
- **Llama 3**: Requires self-hosting (GPU)
- **Gemini Pro**: Overkill for this use case

### Integration

**File**: `backend/app/rag/evaluator.py`

```python
import google.generativeai as genai

class GradingEvaluator:
    def __init__(self, settings: Settings):
        genai.configure(api_key=settings.gemini_api_key)
        
        self.model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            generation_config={
                "temperature": 0.1,      # Low for consistency
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 4096,
            },
        )
    
    def evaluate(self, submission_text, rubrics, retrieval_result, assignment):
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(...)
        
        response = self.model.generate_content([system_prompt, user_prompt])
        return self._parse_response(response.text, assignment.max_score)
```

### Prompt Strategy

**Two-Message Format**:
1. **System Prompt**: Role definition, guidelines
2. **User Prompt**: Assignment details, rubrics, context, submission

**Structured Output**: JSON schema enforced in prompt

```json
{
  "total_score": 85.0,
  "percentage": 85.0,
  "criteria_scores": [
    {
      "criterion_name": "Code Quality",
      "awarded": 25.0,
      "max": 30.0,
      "reasoning": "..."
    }
  ],
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "missing_topics": ["..."],
  "overall_feedback": "...",
  "confidence_score": 0.85
}
```

### Error Handling

**Retry Strategy**:
1. **First attempt**: Full prompt with context
2. **Retry attempt**: Simplified prompt
3. **Fallback**: 50% score with manual review flag

**Common Failures**:
- Malformed JSON → Retry with stricter instructions
- API timeout → Exponential backoff
- Rate limit → Wait and retry
- Invalid score → Cap at max_score

### Rate Limiting

**Gemini 2.0 Flash Limits**:
- 1,000 requests per minute
- 4M tokens per minute

**Current Usage**:
- ~5-10 evaluations per minute
- ~1,000-2,000 tokens per evaluation

**No rate limiting implemented** (within free tier limits)

### Cost Estimation

**Per Evaluation**:
- Input: ~1,000 tokens (context + submission)
- Output: ~500 tokens (evaluation JSON)

**Cost**:
- Input: 1,000 × $0.075 / 1M = $0.000075
- Output: 500 × $0.30 / 1M = $0.00015
- **Total: ~$0.000225 per evaluation**

**1,000 Evaluations/Month**: ~$0.23
**10,000 Evaluations/Month**: ~$2.30

### Why Gemini

| Reason | Benefit |
|--------|---------|
| **Cost-Effective** | 10x cheaper than GPT-4 |
| **Fast** | 2-5 second latency |
| **Large Context** | 1M tokens (entire course materials) |
| **Google Quality** | Reliable, well-maintained |
| **JSON Mode** | Better structured output support |
| **No Fine-Tuning Needed** | Works out-of-the-box |

**See [AI_EVALUATION.md](./AI_EVALUATION.md) for prompt engineering details.**


## Service Communication

### Communication Patterns

```mermaid
graph TB
    subgraph "Synchronous Communication"
        Browser[Browser] -->|HTTP/REST| FastAPI[FastAPI]
        FastAPI -->|SQL| PostgreSQL[(PostgreSQL)]
        FastAPI -->|Commands| Redis[(Redis)]
    end
    
    subgraph "Asynchronous Communication"
        FastAPI -->|Queue Task| RedisQueue[(Redis Queue)]
        RedisQueue -->|Dispatch| Celery[Celery Worker]
        Celery -->|Poll| RedisQueue
    end
    
    subgraph "External Services"
        Celery -->|HTTP| MinIO[(MinIO)]
        Celery -->|HTTP| ChromaDB[(ChromaDB)]
        Celery -->|HTTPS| Gemini[Gemini API]
    end
    
    Browser -.->|Poll Status| FastAPI
```

### Communication Protocols

| Service A | Service B | Protocol | Purpose |
|-----------|-----------|----------|---------|
| Browser | Nginx | HTTP/HTTPS | Web traffic |
| Nginx | FastAPI | HTTP | API proxy |
| FastAPI | PostgreSQL | TCP (asyncpg) | Database queries |
| FastAPI | Redis | TCP (Redis protocol) | Cache, session |
| FastAPI | Redis | TCP (Redis protocol) | Queue tasks |
| Celery | Redis | TCP (Redis protocol) | Fetch tasks, store results |
| Celery | PostgreSQL | TCP (psycopg2) | Database queries (sync) |
| Celery | MinIO | HTTP (S3 API) | File operations |
| Celery | ChromaDB | HTTP (REST) | Vector operations |
| Celery | Gemini | HTTPS (REST) | AI inference |

### Network Topology

**Docker Compose Network**:
```yaml
networks:
  default:
    name: gradeai-network
```

**Service Hostnames**:
- `postgres` → PostgreSQL (internal only)
- `redis` → Redis (internal only)
- `chromadb` → ChromaDB (internal only)
- `minio` → MinIO (internal + external)
- `backend` → FastAPI (internal + Nginx proxy)
- `celery-worker` → Celery (internal only)
- `frontend` → React build (served by Nginx)

### Request Flow Examples

#### Example 1: Create Course (Synchronous)

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Nginx
    participant F as FastAPI
    participant P as PostgreSQL
    participant R as Redis
    
    B->>N: POST /api/v1/courses
    N->>F: Proxy Request
    F->>R: Check JWT Blacklist
    R-->>F: Not Blacklisted
    F->>P: INSERT INTO courses
    P-->>F: Course Record
    F-->>N: 201 Created
    N-->>B: JSON Response
```

#### Example 2: Upload Document (Asynchronous)

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as FastAPI
    participant M as MinIO
    participant RQ as Redis Queue
    participant C as Celery
    participant Ch as ChromaDB
    participant P as PostgreSQL
    
    B->>F: POST /uploads/presign
    F->>M: Generate Presigned URL
    M-->>F: Signed URL
    F-->>B: {upload_url}
    
    B->>M: PUT {upload_url}<br/>File Bytes
    M-->>B: 200 OK
    
    B->>F: POST /uploads/confirm
    F->>M: Check File Exists
    M-->>F: Exists
    F->>P: INSERT INTO documents
    F->>RQ: Queue process_document
    F-->>B: {document_id, status: PENDING}
    
    RQ->>C: Dispatch Task
    C->>M: Download File
    C->>C: Parse, Chunk, Embed
    C->>P: Store Chunks
    C->>Ch: Store Vectors
    C->>P: UPDATE parse_status=SUCCESS
    
    B->>F: GET /uploads/{id}/status
    F->>P: SELECT parse_status
    P-->>F: SUCCESS
    F-->>B: {status: SUCCESS}
```

#### Example 3: Submit Assignment (Full Pipeline)

```mermaid
sequenceDiagram
    participant S as Student
    participant F as FastAPI
    participant RQ as Redis Queue
    participant C as Celery
    participant Ch as ChromaDB
    participant G as Gemini
    participant P as PostgreSQL
    
    S->>F: POST /submissions
    F->>P: INSERT submission, document
    F->>RQ: Queue process_document
    F->>RQ: Queue evaluate_submission (15s delay)
    F-->>S: {submission_id}
    
    RQ->>C: process_document
    C->>C: Parse, Chunk, Embed
    C->>Ch: Store Vectors
    C->>P: UPDATE parse_status=SUCCESS
    
    Note over RQ,C: Wait 15 seconds
    
    RQ->>C: evaluate_submission
    C->>P: Load Submission, Rubrics
    C->>Ch: Query Vectors (retrieve context)
    Ch-->>C: Relevant Chunks
    C->>G: POST Evaluation Request
    G-->>C: JSON Response
    C->>P: INSERT evaluation
    C->>P: UPDATE submission status=EVALUATED
    
    S->>F: GET /evaluations/{id}
    F->>P: SELECT evaluation
    P-->>F: Evaluation Data
    F-->>S: {score, feedback}
```

### Service Dependencies

**Startup Order** (docker-compose `depends_on`):
1. PostgreSQL, Redis, ChromaDB, MinIO (infrastructure)
2. Backend (depends on: postgres, redis, chromadb)
3. Celery Worker (depends on: postgres, redis)
4. Frontend (depends on: backend)
5. Nginx (depends on: backend, frontend)

### Health Checks

**All Services**: Health checks defined in `docker-compose.yml`

```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready"]
    interval: 10s

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s

chromadb:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
    interval: 15s
```

### Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|-----------|
| PostgreSQL down | All operations fail | Connection pool retries |
| Redis down | Task queue stops, cache unavailable | Celery retries, app continues |
| ChromaDB down | Retrieval fails, uses rubric only | Graceful degradation |
| MinIO down | Upload fails | Presigned URL expires, retry |
| Gemini API down | Evaluation fails | Retry with backoff, fallback evaluation |
| Celery worker crashes | Tasks requeue | Task acknowledgment ensures no loss |


## Deployment Architecture

### Docker Compose Architecture

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "gradeai-network"
            Nginx[nginx:1.27<br/>Reverse Proxy<br/>Port 80]
            Frontend[React Build<br/>Static Files]
            Backend[FastAPI<br/>Uvicorn<br/>Port 8000]
            Celery[Celery Worker<br/>Python Process]
            
            PG[(postgres:16<br/>Port 5432)]
            Redis[(redis:7<br/>Port 6379)]
            Chroma[(chromadb:0.5.23<br/>Port 8001)]
            MinIO[(minio<br/>Ports 9000, 9001)]
        end
        
        PGVol[postgres_data<br/>Volume]
        RedisVol[redis_data<br/>Volume]
        ChromaVol[chroma_data<br/>Volume]
        MinIOVol[minio_data<br/>Volume]
    end
    
    Client[External Client] -->|HTTP :80| Nginx
    Nginx -->|Serve Static| Frontend
    Nginx -->|Proxy /api| Backend
    
    Backend --> PG
    Backend --> Redis
    Backend --> MinIO
    
    Celery --> PG
    Celery --> Redis
    Celery --> Chroma
    Celery --> MinIO
    
    PG --> PGVol
    Redis --> RedisVol
    Chroma --> ChromaVol
    MinIO --> MinIOVol
```

### Docker Compose Services

**File**: `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: gradeai-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-gradeai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-gradeai}
      POSTGRES_DB: ${POSTGRES_DB:-gradeai}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gradeai"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: gradeai-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  chromadb:
    image: chromadb/chroma:0.5.23
    container_name: gradeai-chromadb
    restart: unless-stopped
    environment:
      IS_PERSISTENT: "TRUE"
      ANONYMIZED_TELEMETRY: "FALSE"
    volumes:
      - chroma_data:/chroma/chroma
    ports:
      - "8001:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 15s

  minio:
    image: minio/minio
    container_name: gradeai-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    container_name: gradeai-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      chromadb:
        condition: service_healthy
    ports:
      - "8000:8000"
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  celery-worker:
    build:
      context: .
      dockerfile: docker/celery.Dockerfile
    container_name: gradeai-celery
    restart: unless-stopped
    env_file:
      - ./backend/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: celery -A app.celery_app worker --loglevel=info

  frontend:
    build:
      context: .
      dockerfile: docker/frontend.Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL:-/api/v1}
    container_name: gradeai-frontend
    restart: unless-stopped
    depends_on:
      - backend

  nginx:
    image: nginx:1.27-alpine
    container_name: gradeai-nginx
    restart: unless-stopped
    ports:
      - "${NGINX_PORT:-80}:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
  redis_data:
  chroma_data:
  minio_data:
```

### Nginx Configuration

**File**: `nginx/conf.d/default.conf`

```nginx
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name localhost;

    # Frontend (React SPA)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Documentation (development only)
    location /docs {
        proxy_pass http://backend;
    }

    location /openapi.json {
        proxy_pass http://backend;
    }
}
```

### Production Deployment Considerations

**Environment Variables**:
```bash
# Production .env
APP_ENV=production
DEBUG=false

# Strong JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Production database
DATABASE_URL=postgresql+asyncpg://user:pass@prod-db:5432/gradeai

# Production Redis
REDIS_URL=redis://prod-redis:6379/0

# Real S3 or production MinIO
AWS_S3_BUCKET=gradeai-prod-uploads
AWS_ENDPOINT_URL=https://s3.amazonaws.com

# Gemini API key
GEMINI_API_KEY=your-production-api-key

# CORS for production domain
CORS_ORIGINS=https://gradeai.example.com
```

### Scaling Strategy

**Horizontal Scaling**:

```yaml
# Scale Celery workers
docker-compose up -d --scale celery-worker=4

# Scale FastAPI (with load balancer)
docker-compose up -d --scale backend=3
```

**Vertical Scaling**:
```yaml
# Increase resources
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

### Monitoring

**Logging**:
- All services log to stdout
- Captured by Docker logging driver
- Can be forwarded to ELK stack, CloudWatch, etc.

**Metrics**:
- PostgreSQL: pg_stat tables
- Redis: INFO command
- FastAPI: Built-in metrics (future: Prometheus)
- Celery: Flower dashboard (future)

### Backup Strategy

**PostgreSQL**:
```bash
# Backup
docker-compose exec postgres pg_dump -U gradeai gradeai > backup.sql

# Restore
docker-compose exec -T postgres psql -U gradeai gradeai < backup.sql
```

**Redis** (AOF already enabled):
```bash
# Backup AOF file
docker cp gradeai-redis:/data/appendonly.aof ./backup/
```

**ChromaDB**:
```bash
# Backup entire data directory
docker cp gradeai-chromadb:/chroma/chroma ./backup/chroma/
```

**MinIO**:
```bash
# Use MinIO client
mc mirror minio/gradeai-uploads ./backup/uploads/
```

### High Availability Setup

**Production Architecture**:

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[AWS ALB / Nginx]
    end
    
    subgraph "Application Tier"
        FastAPI1[FastAPI Instance 1]
        FastAPI2[FastAPI Instance 2]
        FastAPI3[FastAPI Instance 3]
        
        Celery1[Celery Worker 1]
        Celery2[Celery Worker 2]
        Celery3[Celery Worker 3]
    end
    
    subgraph "Data Tier"
        PG[(PostgreSQL<br/>Primary + Replica)]
        RedisCluster[(Redis Cluster<br/>3 Masters)]
        S3[(AWS S3)]
    end
    
    LB --> FastAPI1
    LB --> FastAPI2
    LB --> FastAPI3
    
    FastAPI1 --> PG
    FastAPI1 --> RedisCluster
    FastAPI1 --> S3
    
    Celery1 --> PG
    Celery1 --> RedisCluster
    Celery1 --> S3
```

**See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment guide.**


## Technology Choices

### Decision Matrix

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| **Frontend Framework** | React | Vue, Angular, Svelte | Largest ecosystem, best TypeScript support |
| **Build Tool** | Vite | Webpack, CRA | 10-100x faster dev server |
| **State Management** | Zustand + React Query | Redux, MobX, Jotai | Minimal boilerplate, excellent DX |
| **Backend Framework** | FastAPI | Flask, Django, Express | Async/await, auto docs, Pydantic validation |
| **ORM** | SQLAlchemy 2.0 | Django ORM, Prisma | Best async Python ORM, framework-agnostic |
| **Database** | PostgreSQL | MySQL, MongoDB | JSONB, full-text search, ACID |
| **Task Queue** | Celery | RQ, Dramatiq, Bull | Battle-tested, scalable, monitoring tools |
| **Message Broker** | Redis | RabbitMQ, AWS SQS | Lightweight, multi-purpose |
| **Object Storage** | MinIO | AWS S3, Cloudinary | S3-compatible, self-hosted, zero egress |
| **Vector Database** | ChromaDB | Pinecone, Weaviate, Qdrant | Open-source, Python-native, metadata filtering |
| **Embedding Model** | all-MiniLM-L6-v2 | OpenAI, BGE, E5 | Local, fast, zero cost |
| **LLM** | Gemini 2.0 Flash | GPT-4, Claude, Llama | 10x cheaper, 1M context, fast |
| **Logging** | structlog | logging, loguru | Structured, JSON output, context |
| **Validation** | Pydantic | Marshmallow, Cerberus | Type safety, FastAPI integration |
| **Password Hashing** | Argon2 | bcrypt, scrypt | Winner of Password Hashing Competition |
| **JWT Library** | python-jose | PyJWT | RSA support, better API |

### Key Design Principles

**1. Async-First Architecture**
- FastAPI with async/await
- AsyncPG for database
- Async Redis client
- Non-blocking I/O throughout

**2. Separation of Concerns**
- API layer separate from business logic
- Models separate from schemas
- Services encapsulate domain logic

**3. Stateless Services**
- FastAPI instances are stateless
- Celery workers are stateless
- Enables horizontal scaling

**4. Fail-Safe Defaults**
- Retry mechanisms on failures
- Graceful degradation (fallback evaluation)
- Connection pool pre-ping

**5. Type Safety**
- TypeScript in frontend
- Pydantic schemas in backend
- SQLAlchemy mapped columns with types

**6. Observability**
- Structured logging (JSON)
- Request ID tracing
- Health check endpoints

### Trade-Offs and Limitations

**Chosen Approach**: Local embedding model
- **Pro**: Zero cost, no rate limits, privacy
- **Con**: Lower quality than OpenAI embeddings
- **Mitigation**: Can upgrade to larger model or fine-tune

**Chosen Approach**: Synchronous Celery tasks
- **Pro**: Simpler implementation
- **Con**: Cannot use async database operations
- **Mitigation**: Separate sync session factory

**Chosen Approach**: Course-level ChromaDB collections
- **Pro**: Notes shared across assignments
- **Con**: Cannot fully isolate assignment contexts
- **Mitigation**: Metadata filtering

**Chosen Approach**: Presigned URLs for uploads
- **Pro**: Offloads file transfer from backend
- **Con**: Complexity in dual-endpoint configuration
- **Mitigation**: Clear documentation, S3Service abstraction

**Chosen Approach**: JSON response from Gemini
- **Pro**: Structured, parseable output
- **Con**: Fragile if LLM returns malformed JSON
- **Mitigation**: Retry logic, fallback evaluation


## Design Patterns

### 1. Repository Pattern (Implicit)

**Location**: SQLAlchemy models act as repositories

```python
# Direct model usage (common pattern in FastAPI)
async def get_course(course_id: UUID, db: AsyncSession) -> Course:
    result = await db.execute(
        select(Course).where(Course.id == course_id)
    )
    return result.scalar_one_or_none()
```

**Why Not Explicit Repositories**:
- SQLAlchemy already provides abstraction
- FastAPI encourages direct model usage
- Simpler for smaller projects

### 2. Dependency Injection

**Location**: `app/core/deps.py`

```python
# Dependencies injected via FastAPI's Depends
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User:
    # Authentication logic
    return user

# Usage in endpoints
@router.get("/courses")
async def list_courses(
    current_user: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
):
    # current_user is automatically populated
```

**Benefits**:
- Testable (mock dependencies)
- Reusable across endpoints
- Clear dependencies

### 3. Service Layer Pattern

**Location**: `app/services/`

```python
# S3Service encapsulates all S3 operations
class S3Service:
    def __init__(self, settings: Settings):
        self._client = boto3.client(...)
    
    def generate_presigned_upload_url(self, ...):
        # Implementation
    
    def file_exists(self, file_key: str) -> bool:
        # Implementation
```

**Benefits**:
- Single responsibility
- Encapsulation
- Easy to mock in tests

### 4. Factory Pattern

**Location**: `app/db/session.py`

```python
# Session factory created at startup
_session_factory: async_sessionmaker[AsyncSession] | None = None

async def init_db_pool(settings: Settings) -> None:
    global _engine, _session_factory
    _engine = create_async_engine(settings.database_url)
    _session_factory = async_sessionmaker(_engine, ...)

def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Database not initialized")
    return _session_factory
```

### 5. Singleton Pattern

**Location**: `app/rag/embeddings.py`

```python
# Single embedding service instance per worker
_embedding_service_instance = None

def get_embedding_service() -> EmbeddingService:
    global _embedding_service_instance
    if _embedding_service_instance is None:
        _embedding_service_instance = EmbeddingService()
    return _embedding_service_instance

# Initialized on module import
embedding_service = get_embedding_service()
```

**Why**: Model loading is expensive (~2-3 seconds)

### 6. Strategy Pattern

**Location**: `app/rag/parsers.py`

```python
# Different parsing strategies based on MIME type
def parse_document(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return parse_pdf(file_bytes)
    elif mime_type == "...docx":
        return parse_docx(file_bytes)
    elif mime_type == "text/plain":
        return parse_txt(file_bytes)
```

### 7. Retry Pattern

**Location**: Celery tasks

```python
@celery_app.task(bind=True, max_retries=3)
def process_document(self, document_id: str):
    try:
        # Processing logic
    except Exception as exc:
        if self.request.retries < self.max_retries:
            countdown = 30 * (2 ** self.request.retries)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            raise
```

**Exponential backoff**: 30s → 60s → 120s

### 8. Circuit Breaker (Implicit)

**Location**: ChromaDB retrieval

```python
if not self.chroma.collection_exists(collection_name):
    logger.warning("collection_not_found")
    return RetrievalResult(rubric_chunks=[], ...)  # Empty result
```

**Graceful degradation** instead of failure

### 9. Adapter Pattern

**Location**: `app/infrastructure/chromadb_client.py`

```python
# Wraps ChromaDB client with application-specific interface
class ChromaDBClient:
    def __init__(self, settings: Settings):
        self._client = chromadb.HttpClient(...)
    
    def add_chunks(self, ...):
        # Adapts to ChromaDB's API
        collection = self._client.get_collection(...)
        collection.add(...)
```

### 10. Template Method Pattern

**Location**: `app/rag/evaluator.py`

```python
def evaluate(self, ...):
    # Template method
    system_prompt = self._build_system_prompt()
    user_prompt = self._build_user_prompt(...)
    response = self.model.generate_content([system_prompt, user_prompt])
    return self._parse_response(response.text, ...)
```

**Fixed algorithm**, customizable steps


## Security Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant API as FastAPI
    participant DB as PostgreSQL
    participant Redis as Redis
    
    C->>API: POST /auth/login<br/>{email, password}
    API->>DB: SELECT user WHERE email=?
    DB-->>API: User record
    API->>API: Verify password (Argon2)
    
    alt Password Valid
        API->>API: Generate access_token (JWT)<br/>Generate refresh_token (JWT)
        API->>Redis: Store refresh_token mapping
        API-->>C: {access_token, refresh_token, user}
    else Invalid
        API-->>C: 401 Unauthorized
    end
    
    Note over C: Store tokens in memory/localStorage
    
    C->>API: GET /courses<br/>Authorization: Bearer {access_token}
    API->>API: Decode JWT, extract user_id
    API->>Redis: Check blacklist:{jti}
    
    alt Not Blacklisted
        API->>DB: SELECT user WHERE id=user_id
        DB-->>API: User record
        API->>API: Process request
        API-->>C: Response
    else Blacklisted
        API-->>C: 401 Token revoked
    end
```

### JWT Token Structure

**Access Token** (short-lived):
```json
{
  "sub": "user-uuid",
  "type": "access",
  "jti": "token-uuid",
  "role": "professor",
  "exp": 1234567890,
  "iat": 1234567860
}
```

**Refresh Token** (long-lived):
```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "jti": "token-uuid",
  "exp": 1235000000,
  "iat": 1234567860
}
```

### Password Security

**Hashing**: Argon2id (winner of Password Hashing Competition)

**File**: `app/core/security.py`

```python
from argon2 import PasswordHasher

ph = PasswordHasher()

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except:
        return False
```

**Why Argon2**:
- Memory-hard (resists GPU attacks)
- Configurable time/memory costs
- Recommended by OWASP

### Authorization

**Role-Based Access Control (RBAC)**:

```python
# Roles
class UserRole(StrEnum):
    PROFESSOR = "professor"
    STUDENT = "student"
    TA = "ta"
    ADMIN = "admin"

# Role checks
async def require_professor(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.PROFESSOR:
        raise HTTPException(403, "Professor role required")
    return current_user
```

**Resource Ownership**:
```python
# Professor can only access their own courses
async def _get_professor_course(course_id, professor, db):
    course = await db.get(Course, course_id)
    if course.professor_id != professor.id:
        raise HTTPException(404, "Course not found")
    return course
```

### CORS Configuration

**File**: `app/main.py`

```python
application.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[settings.request_id_header],
)
```

### File Upload Security

**Content Type Validation**:
```python
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
```

**Presigned URL Security**:
- URLs expire after 1 hour (upload) or 24 hours (download)
- Signed with AWS credentials
- Cannot be reused after expiration

**File Size**: No explicit limit (future: add max size check)

### SQL Injection Prevention

**SQLAlchemy ORM**:
- Parameterized queries by default
- No raw SQL concatenation

```python
# Safe (parameterized)
result = await db.execute(
    select(User).where(User.email == email)
)

# Dangerous (never do this)
# await db.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

### XSS Prevention

**Frontend**:
- React escapes all content by default
- No `dangerouslySetInnerHTML` usage

**Backend**:
- Pydantic validates all inputs
- No HTML rendering on backend

### CSRF Protection

**Not Implemented** (API-only, no cookies)
- JWT in Authorization header (not cookie)
- No session cookies

### Rate Limiting

**Not Currently Implemented**

**Future Implementation**:
```python
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5 per minute")
async def login(...):
    pass
```

### Secrets Management

**Environment Variables**:
- `.env` files for development
- Environment variables in production
- Never committed to git (`.gitignore`)

**Sensitive Data**:
- `JWT_SECRET`: 32-byte random string
- `GEMINI_API_KEY`: Google API key
- Database passwords
- AWS credentials

### Known Security Limitations

1. **No malware scanning** on uploaded files
2. **No rate limiting** on API endpoints
3. **No file size limits** on uploads
4. **No IP whitelisting** for admin operations
5. **JWT refresh tokens** not rotated on use
6. **No 2FA/MFA** for authentication
7. **Presigned URLs** valid for 1 hour (could be shorter)

**See [SECURITY.md](./SECURITY.md) for detailed security documentation.**

---

## Summary

GradeAI is a distributed web application built with modern technologies:

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI + SQLAlchemy + Pydantic
- **Database**: PostgreSQL + Redis + ChromaDB + MinIO
- **Task Queue**: Celery
- **AI**: Google Gemini + sentence-transformers

**Key Architectural Decisions**:
1. **Async-first** for performance
2. **Microservices-inspired** for scalability
3. **RAG-based AI** for context-aware grading
4. **Presigned URLs** for efficient file handling
5. **Vector search** for semantic retrieval

**Production-Ready Features**:
- Health checks on all services
- Retry mechanisms with exponential backoff
- Graceful degradation on failures
- Structured logging
- Type safety throughout

For detailed documentation on specific components, see the linked documentation files throughout this document.

---

**End of Architecture Documentation**
