# GradeAI

Production-grade monorepo for an AI-assisted grading platform. The stack includes a FastAPI backend, React frontend, PostgreSQL, Redis, ChromaDB vector store, Celery workers, and Nginx reverse proxy.

## Repository structure

```
gradeai/
├── backend/          # FastAPI application
├── frontend/         # Vite + React + TypeScript
├── docker/           # Docker build definitions
├── nginx/            # Reverse proxy configuration
├── scripts/          # Development and operations scripts
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Prerequisites

- Docker 24+ and Docker Compose v2
- Make (GNU Make on Linux/macOS; use Git Bash or WSL on Windows)
- Node.js 22+ (local frontend development)
- Python 3.12+ (local backend development)
- Optional: `pre-commit` for git hooks

## Quick start (Docker)

1. Clone the repository and enter the project root:

   ```bash
   cd gradeai
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Set required secrets in `.env`:

   - `JWT_SECRET` — long random string for production
   - `OPENAI_API_KEY` / `GEMINI_API_KEY` — AI provider keys
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` — file uploads

4. Start the full development stack:

   ```bash
   make dev
   ```

5. Run database migrations and seed data:

   ```bash
   make migrate
   make seed
   ```

### Service URLs

| Service        | URL                          |
|----------------|------------------------------|
| Application    | http://localhost             |
| API (direct)   | http://localhost:8000        |
| API docs       | http://localhost/docs        |
| Frontend       | http://localhost:3000        |
| PostgreSQL     | localhost:5432               |
| Redis          | localhost:6379               |
| ChromaDB       | http://localhost:8001        |

Default seeded admin (development only): `admin@gradeai.local` / `changeme123`

## Makefile commands

| Command              | Description                                      |
|----------------------|--------------------------------------------------|
| `make dev`           | Start infrastructure and application services    |
| `make build`         | Build all Docker images                          |
| `make test`          | Run backend pytest and frontend lint/typecheck   |
| `make migrate`       | Apply Alembic migrations                         |
| `make seed`          | Insert development seed data                     |
| `make lint`          | Run Ruff, Black, and ESLint                      |
| `make install-hooks` | Install pre-commit git hooks                     |
| `make up` / `make down` | Start/stop compose stack in detached mode     |

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Celery worker (separate terminal):

```bash
celery -A app.celery_app.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8000`.

## Environment variables

Copy `.env.example` to `.env`. Key variables:

| Variable           | Description                                |
|--------------------|--------------------------------------------|
| `DATABASE_URL`     | Async SQLAlchemy connection string         |
| `REDIS_URL`        | Redis connection for caching               |
| `CHROMADB_HOST`    | ChromaDB hostname (use `chromadb` in Docker)|
| `OPENAI_API_KEY`   | OpenAI API key                             |
| `GEMINI_API_KEY`   | Google Gemini API key                      |
| `JWT_SECRET`       | Secret for signing access tokens           |
| `AWS_S3_BUCKET`    | S3 bucket for uploaded submissions         |
| `CELERY_BROKER_URL`| Celery message broker (Redis DB 1)         |

## Pre-commit hooks

Install hooks once per machine:

```bash
make install-hooks
```

Hooks run on each commit:

- **Ruff** — Python linting and import sorting (`backend/`)
- **Black** — Python formatting (`backend/`)
- **ESLint** — TypeScript/React linting (`frontend/`)

Run manually:

```bash
pre-commit run --all-files
```

## CI/CD

GitHub Actions workflows live in [`.github/workflows/`](.github/workflows/):

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [`ci.yml`](.github/workflows/ci.yml) | Pull requests | Python (ruff, black, pytest ≥80% coverage, mypy), frontend (eslint, tsc, vitest, build), Docker health |
| [`deploy-staging.yml`](.github/workflows/deploy-staging.yml) | Push to `main` | Full CI → ECR push → ECS staging → Alembic migrate → smoke test → Slack |
| [`deploy-production.yml`](.github/workflows/deploy-production.yml) | Tags `v*.*.*` | Manual approval → promote staging images → blue/green ECS → rollback on failure → GitHub Release |

Configure secrets and environments using [`.github/SECRETS.md`](.github/SECRETS.md). Replace placeholders in [`deploy/ecs/`](deploy/ecs/) task definitions before the first AWS deploy.

## Testing

```bash
make test
```

Backend only:

```bash
cd backend && pytest -v --cov=app
```

Frontend only:

```bash
cd frontend && npm run typecheck && npm run lint
```

## Production deployment

```bash
cp .env.example .env
# Edit .env with production values (APP_ENV=production, DEBUG=false)
bash scripts/prod.sh
```

Production builds use multi-stage Dockerfiles in `docker/` with no hot-reload. Nginx terminates HTTP and routes `/api` to the backend and `/` to the frontend.

## API overview

| Method | Path                    | Description        |
|--------|-------------------------|--------------------|
| GET    | `/api/v1/health`        | Liveness check     |
| GET    | `/api/v1/health/ready`  | Readiness check    |
| POST   | `/api/v1/auth/register` | Register user      |
| POST   | `/api/v1/auth/login`    | Obtain JWT         |
| GET    | `/api/v1/users/me`      | Current user       |

## License

Proprietary — GradeAI. All rights reserved.
