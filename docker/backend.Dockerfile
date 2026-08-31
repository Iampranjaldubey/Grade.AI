FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY backend/requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

FROM base AS runtime

COPY --from=builder /install /usr/local
COPY backend/ .

RUN addgroup --system gradeai && adduser --system --ingroup gradeai gradeai

# Give the non-root user a writable HuggingFace/sentence-transformers cache.
# The web process loads the embedding model lazily (and normally never), but
# setting this keeps model downloads out of the read-only '/nonexistent' home
# if any code path does trigger a load.
ENV HF_HOME=/home/gradeai/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/home/gradeai/.cache/torch/sentence_transformers
RUN mkdir -p "$HF_HOME" "$SENTENCE_TRANSFORMERS_HOME" \
    && chown -R gradeai:gradeai /home/gradeai

USER gradeai

EXPOSE 8000

# Liveness, not readiness: this check restarts the container, so it must not
# fail merely because a dependency is briefly unreachable. Readiness (which
# returns 503 when the DB or Redis is down) belongs on the load balancer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health/live || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
