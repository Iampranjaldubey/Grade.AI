#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Running backend tests..."
cd "$ROOT_DIR/backend"
pytest -v --cov=app --cov-report=term-missing

echo "Running frontend checks..."
cd "$ROOT_DIR/frontend"
npm run typecheck
npm run lint
