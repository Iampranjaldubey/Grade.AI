#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

if docker compose ps backend 2>/dev/null | grep -q "running"; then
  docker compose exec backend alembic upgrade head
else
  alembic upgrade head
fi
