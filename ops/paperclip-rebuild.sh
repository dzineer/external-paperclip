#!/bin/bash
# Auto-rebuild Paperclip server after source changes
# Usage: ./paperclip-rebuild.sh           (one-shot rebuild)
#        ./paperclip-rebuild.sh --watch   (watch for changes, auto-rebuild)

set -e

# Resolve to repo root — follow symlinks, then go up from ops/
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment from .env if it exists
if [ -f "$COMPOSE_DIR/.env" ]; then
  set -a; source "$COMPOSE_DIR/.env"; set +a
fi

export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET must be set in .env}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export PAPERCLIP_PUBLIC_URL="${PAPERCLIP_PUBLIC_URL:-http://localhost:3100}"

rebuild() {
  echo ""
  echo "=== $(date '+%H:%M:%S') — Building Paperclip ==="
  cd "$COMPOSE_DIR"

  # Step 1: Build image + try to start
  docker-compose up -d --build server 2>&1 | tee /tmp/paperclip-build.log | grep -E "(Step [0-9]+/|Successfully|ERROR|error TS|Creating|Recreating|done)" || true

  # Step 2: Check for ContainerConfig bug
  if grep -q "ContainerConfig" /tmp/paperclip-build.log; then
    echo "$(date '+%H:%M:%S') — ContainerConfig bug detected, fixing..."
    docker ps -a --filter "name=server" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null
    docker-compose up -d server 2>&1
  fi

  # Step 3: Check for build failures
  if grep -q "error TS" /tmp/paperclip-build.log; then
    echo "$(date '+%H:%M:%S') — BUILD FAILED (TypeScript errors)"
    grep "error TS" /tmp/paperclip-build.log
    return 1
  fi

  if grep -q "ERR_PNPM" /tmp/paperclip-build.log; then
    echo "$(date '+%H:%M:%S') — BUILD FAILED"
    grep "ERR_PNPM" /tmp/paperclip-build.log
    return 1
  fi

  # Step 4: Wait for healthy
  echo "$(date '+%H:%M:%S') — Waiting for server..."
  for i in $(seq 1 20); do
    sleep 2
    if curl -s http://localhost:3100/api/health 2>/dev/null | grep -q '"status":"ok"'; then
      echo "$(date '+%H:%M:%S') — Server is healthy."
      return 0
    fi
  done

  echo "$(date '+%H:%M:%S') — WARNING: Server not healthy after 40s"
  docker logs external-paperclip_server_1 --tail 10 2>&1 || true
  return 1
}

if [ "$1" = "--watch" ]; then
  echo "=== Paperclip Auto-Rebuild Watcher ==="
  echo "Watching: $COMPOSE_DIR/{server,ui,packages,skills}"
  echo "Press Ctrl+C to stop."
  echo ""

  # Install inotify-tools if needed
  if ! command -v inotifywait &>/dev/null; then
    echo "Installing inotify-tools..."
    sudo apt-get install -y inotify-tools 2>/dev/null || {
      echo "ERROR: inotify-tools not available."
      exit 1
    }
  fi

  # Initial build
  rebuild || true

  # Watch loop
  while true; do
    inotifywait -r -q -e modify,create,delete \
      --include '\.(ts|tsx|sql|md|json)$' \
      "$COMPOSE_DIR/server/src" \
      "$COMPOSE_DIR/ui/src" \
      "$COMPOSE_DIR/packages" \
      "$COMPOSE_DIR/skills" \
      2>/dev/null

    echo ""
    echo "$(date '+%H:%M:%S') — Change detected!"
    sleep 2  # debounce multiple rapid changes
    rebuild || true
  done
else
  rebuild
fi
