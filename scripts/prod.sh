#!/usr/bin/env bash
# Manage the production stack (docker-compose.prod.yml + .env.prod).
#
#   ./scripts/prod.sh up          build images and start/update everything
#   ./scripts/prod.sh status      container health + API health check
#   ./scripts/prod.sh logs [svc]  follow logs (all services or one)
#   ./scripts/prod.sh seed-demo   load the demo course and accounts
#   ./scripts/prod.sh backup      dump Postgres to backups/
#   ./scripts/prod.sh down        stop (data volumes are kept)
#   ./scripts/prod.sh compose ... any other docker compose command
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.prod ]]; then
  echo "Missing .env.prod. Create it with: ./scripts/init-prod-env.sh" >&2
  exit 1
fi

compose() { docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"; }
env_value() { grep -E "^$1=" .env.prod | tail -1 | cut -d= -f2-; }

case "${1:-}" in
  up)
    compose up -d --build --remove-orphans
    compose ps
    echo "Starting. First HTTPS certificate can take a minute: https://$(env_value DOMAIN)"
    ;;
  status)
    compose ps
    echo
    curl -fsS "https://$(env_value DOMAIN)/api/v1/health" && echo || echo "Health check failed"
    ;;
  logs)
    shift
    compose logs -f --tail 100 "$@"
    ;;
  seed-demo)
    compose exec backend python scripts/seed_demo.py
    ;;
  backup)
    mkdir -p backups
    file="backups/gradeai-$(date +%Y%m%d-%H%M%S).sql.gz"
    compose exec -T postgres pg_dump -U "$(env_value POSTGRES_USER)" "$(env_value POSTGRES_DB)" | gzip > "$file"
    echo "Saved $file"
    ;;
  down)
    compose down
    ;;
  compose)
    shift
    compose "$@"
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
