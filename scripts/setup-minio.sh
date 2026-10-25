#!/usr/bin/env bash
# Create the GradeAI storage bucket in the local MinIO container.
#
# The bucket name must match AWS_S3_BUCKET in backend/.env (default
# gradeai-uploads). Objects stay private: the app only ever hands out presigned
# URLs, so no anonymous/public policy is applied.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUCKET="${AWS_S3_BUCKET:-}"
if [[ -z "$BUCKET" && -f backend/.env ]]; then
  BUCKET="$(grep -E '^AWS_S3_BUCKET=' backend/.env | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi
BUCKET="${BUCKET:-gradeai-uploads}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

# Prefer a host-installed mc; otherwise use the one shipped in the MinIO image,
# so no extra install is needed.
if command -v mc >/dev/null 2>&1; then
  ENDPOINT="http://localhost:9000"
  run_mc() { mc "$@"; }
else
  if ! docker compose ps --status running minio 2>/dev/null | grep -q minio; then
    echo "MinIO is not running. Start it with: docker compose up -d minio" >&2
    exit 1
  fi
  ENDPOINT="http://localhost:9000"  # resolved inside the MinIO container
  run_mc() { docker compose exec -T minio mc "$@"; }
fi

echo "Configuring MinIO at ${ENDPOINT}..."
run_mc alias set gradeai "$ENDPOINT" "$MINIO_USER" "$MINIO_PASSWORD" >/dev/null

echo "Creating bucket '${BUCKET}'..."
run_mc mb --ignore-existing "gradeai/${BUCKET}"

# Undo the public-read policy older versions of this script applied.
run_mc anonymous set none "gradeai/${BUCKET}" >/dev/null

echo "Buckets:"
run_mc ls gradeai/
echo "MinIO setup complete."
