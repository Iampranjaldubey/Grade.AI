FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .

RUN addgroup --system gradeai && adduser --system --ingroup gradeai gradeai

# Celery workers DO load the sentence-transformers model, so give the non-root
# user a writable cache dir (its home would otherwise be '/nonexistent').
ENV HF_HOME=/home/gradeai/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/home/gradeai/.cache/torch/sentence_transformers
RUN mkdir -p "$HF_HOME" "$SENTENCE_TRANSFORMERS_HOME" \
    && chown -R gradeai:gradeai /home/gradeai

USER gradeai

CMD ["celery", "-A", "app.celery_app.celery_app", "worker", "--loglevel=info", "--concurrency=2"]
