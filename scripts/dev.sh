#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — update secrets before production use."
fi

docker compose up --build -d postgres redis chromadb
echo "Waiting for infrastructure..."
"$ROOT_DIR/scripts/wait-for.sh" localhost 5432 60
"$ROOT_DIR/scripts/wait-for.sh" localhost 6379 30
"$ROOT_DIR/scripts/wait-for.sh" localhost 8001 60

docker compose up --build backend celery-worker frontend nginx
