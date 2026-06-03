#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if docker compose ps backend 2>/dev/null | grep -q "running"; then
  docker compose exec backend python scripts/seed.py
else
  cd "$ROOT_DIR/backend"
  python scripts/seed.py
fi
