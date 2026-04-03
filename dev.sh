#!/bin/bash
# Start Paperclip in dev mode with hot reload
# UI:  http://localhost:5173  (Vite HMR ��� instant refresh on save)
# API: http://localhost:3100  (tsx watch — auto-restart on backend changes)

set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env
if [ -f .env ]; then
  set -a; source .env; set +a
fi

export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set in .env}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export PAPERCLIP_PUBLIC_URL="${PAPERCLIP_PUBLIC_URL:-http://localhost:5173}"

# Stop production server if running
docker-compose stop server 2>/dev/null || true

# Clear ghost containers (docker-compose v1.29.2 ContainerConfig bug)
docker ps -a --filter "name=server-dev" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
docker ps -a --filter "name=server" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true

echo "=== Starting Paperclip Dev Mode ==="
echo "  UI:  http://localhost:5173  (Vite HMR)"
echo "  API: http://localhost:3100  (tsx watch)"
echo "  Press Ctrl+C to stop"
echo ""

docker-compose -f docker-compose.yml -f docker-compose.dev.yml up server-dev "$@"
