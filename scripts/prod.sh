#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Error: .env file required for production deployment."
  exit 1
fi

export APP_ENV=production
export DEBUG=false

docker compose -f docker-compose.yml build --no-cache
docker compose -f docker-compose.yml up -d

docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed.py

echo "Production stack is running on port ${NGINX_PORT:-80}."
