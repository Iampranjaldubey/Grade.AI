#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?host required}"
PORT="${2:?port required}"
TIMEOUT="${3:-30}"

echo "Waiting for ${HOST}:${PORT} (timeout ${TIMEOUT}s)..."
for i in $(seq 1 "$TIMEOUT"); do
  if (echo > "/dev/tcp/${HOST}/${PORT}") >/dev/null 2>&1; then
    echo "${HOST}:${PORT} is available."
    exit 0
  fi
  sleep 1
done

echo "Timeout waiting for ${HOST}:${PORT}"
exit 1
