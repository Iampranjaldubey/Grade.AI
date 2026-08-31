# GradeAI

AI-assisted grading for university courses. Professors define rubrics; GradeAI drafts a score
and per-criterion feedback from the submission and course material. **Nothing reaches a student
until a professor approves or overrides it.**

Built with FastAPI, React, PostgreSQL, and a retrieval-augmented grading pipeline over ChromaDB.

---

## How grading works

1. A professor creates a course, an assignment, and a **rubric** whose criteria weights total 100%.
2. Course material (lecture notes, sample solutions, rubric documents) is uploaded, parsed,
   chunked, embedded, and indexed.
3. A student submits work. The document is parsed and indexed the same way.
4. A Celery worker retrieves the relevant rubric/notes/sample context and asks the model to score
   each criterion, returning a score, reasoning per criterion, strengths, weaknesses, and a
   confidence value.
5. The professor reviews the draft in a grading workspace and **approves** or **overrides** it.
   Only then is the grade released to the student.

Assignments can be `auto` (AI drafts every grade), `manual` (professor grades directly), or
`hybrid`. If AI grading fails outright, a placeholder is produced and flagged — it is **never**
auto-approved, even in `auto` mode.

---

## Quick start

Requires **Docker** and **Docker Compose**. This brings up Postgres, Redis, ChromaDB, MinIO,
the API, a Celery worker, the frontend, and an nginx edge proxy.

```bash
git clone https://github.com/Iampranjaldubey/Grade.AI.git
cd Grade.AI
make dev
```

`make dev` creates `.env` and `backend/.env` from their examples on first run. To enable AI
grading, add a Google Gemini key to `backend/.env`:

```
GEMINI_API_KEY=your-key-here
```

Then create the storage bucket and apply migrations:

```bash
./scripts/setup-minio.sh   # scripts/setup-minio.bat on Windows
make migrate
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Through nginx | http://localhost |
| MinIO console | http://localhost:9001 |

Useful targets: `make up`, `make down`, `make logs`, `make test`, `make lint`, `make seed`,
`make install-hooks`.

### Running without Docker

You still need Postgres, Redis, and ChromaDB reachable. Requires **Python 3.12+** and
**Node.js 22+**.

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate   # venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env          # then point the URLs at localhost
alembic upgrade head
uvicorn app.main:app --reload

# Celery worker (separate shell) — required for document processing and AI grading
celery -A app.celery_app worker --loglevel=info

# Frontend (separate shell)
cd frontend
npm ci
npm run dev
```

---

## Architecture

```
nginx ──┬── frontend (React SPA, served by nginx)
        └── /api ── FastAPI ──┬── PostgreSQL   (system of record)
                             ├── Redis        (token allowlist/blacklist + Celery broker)
                             ├── S3 / MinIO   (uploaded documents)
                             └── Celery ──┬── ChromaDB (vector search)
                                          └── Gemini   (grading)
```

**Backend** — FastAPI (async), SQLAlchemy 2 + Alembic, Celery, Redis, ChromaDB,
sentence-transformers (`all-MiniLM-L6-v2`, local) for embeddings, Google Gemini for evaluation,
structlog with request-ID correlation.

**Frontend** — React 18 + TypeScript, Vite, React Router v7, TanStack Query, Zustand,
React Hook Form + Zod, Tailwind CSS, Radix primitives for accessible dialogs/menus/tabs.

Documentation lives in [`docs/`](docs/):

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and boundaries |
| [RAG_ARCHITECTURE.md](docs/RAG_ARCHITECTURE.md) | Document lifecycle, chunking, retrieval, evaluation |
| [API.md](docs/API.md) | Endpoint reference |
| [DATABASE.md](docs/DATABASE.md) | Schema and relationships |
| [PROJECT_FLOW.md](docs/PROJECT_FLOW.md) | End-to-end user flows |
| [CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md) | Where things live |
| [DOCUMENT_MANAGEMENT_ARCHITECTURE.md](docs/DOCUMENT_MANAGEMENT_ARCHITECTURE.md) | Upload and processing |
| [.github/SECRETS.md](.github/SECRETS.md) | Deployment secrets and variables |

Interactive API docs are served at `/docs` in non-production environments.

---

## Configuration

All settings are environment variables; see [`.env.example`](.env.example) and
[`backend/.env.example`](backend/.env.example) for the full annotated list.

Values that matter most:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_SYNC` | Async URL for the API, sync for Celery and Alembic |
| `REDIS_URL` | Token allowlist/blacklist; also the Celery broker |
| `JWT_SECRET` | Must be a strong random value; the app refuses to start in production with the default |
| `GEMINI_API_KEY` | Without it, grading falls back to a flagged placeholder |
| `PROFESSOR_REGISTRATION_CODE` | Required in production, or anyone could self-register as a professor |
| `AWS_S3_BUCKET` + endpoints | MinIO locally, S3 in deployment |
| `MAX_UPLOAD_SIZE_BYTES` | Enforced against the stored object, not the client's claim |

In production the app validates its own configuration at startup and refuses to boot when a
required value is missing or left at an insecure default.

---

## Security

- Argon2 password hashing; JWT access tokens with a configurable short lifetime.
- Refresh tokens are an **allowlist** in Redis and are **rotated on every use**; access tokens are
  blacklisted on logout, with the blacklist TTL derived from the token lifetime.
- Per-account login lockout after repeated failures, plus rate limiting on registration and
  presigned-URL requests.
- Privileged roles cannot be self-assigned at registration without the institution code.
- Every read and write verifies ownership — professors are scoped to their own courses, students
  to their own enrolments and submissions. Students cannot read a grade before it is approved.
- Uploads are validated by magic bytes, not just the declared content type.
- Grade approvals, overrides, and manual grades are recorded in an audit trail.

---

## Testing

```bash
make test          # both suites

cd backend  && pytest --cov=app     # coverage gate: 80%
cd frontend && npm run test
```

CI (`.github/workflows/ci.yml`) runs, for every pull request: ruff, black, pytest with coverage,
and mypy for the backend; ESLint, `tsc --noEmit`, Vitest with coverage, and a production build for
the frontend; then builds both Docker images and verifies the stack comes up healthy.

Install the pre-commit hooks to catch most of that locally:

```bash
make install-hooks
```

---

## Deployment

Container images are defined in [`docker/`](docker/) and ECS task definitions in
[`deploy/ecs/`](deploy/ecs/). Pushes to `main` deploy to staging; tagging `v*.*.*` promotes the
same image to production via CodeDeploy blue/green.

> **Not yet provisioned.** The task definitions still contain `ACCOUNT_ID`/`REGION` placeholders,
> and the AWS resources they reference (IAM roles, SSM parameters, ALB listener rules, RDS,
> ElastiCache, S3, ECR repositories, CodeDeploy groups) are not created by anything in this
> repository. See [.github/SECRETS.md](.github/SECRETS.md) before a first deploy.

---

## Contributing

```bash
git checkout -b feature/my-change
make lint
make test
```

Open a pull request; CI must be green before merge.

---

## License

Released under the [MIT License](LICENSE).
