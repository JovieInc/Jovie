#!/usr/bin/env bash
set -euo pipefail
cd apps/web

LAYOUT_GUARD_MANIFEST=$(node ../../.github/scripts/layout-guard-manifest.mjs)
mapfile -t LAYOUT_GUARD_SPECS <<< "$LAYOUT_GUARD_MANIFEST"

if [ ! -f .next/standalone/apps/web/server.js ] || [ ! -f .next/standalone/apps/web/.next/BUILD_ID ]; then
  echo "::error::Layout Guard standalone server entrypoint is missing."
  exit 1
fi

mkdir -p tests/.auth
echo '{"cookies":[],"origins":[]}' > tests/.auth/user.json
export HOSTNAME=localhost
export NEXT_PUBLIC_APP_URL=http://localhost:3230

PORT=3230 node .next/standalone/apps/web/server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

SERVER_READY=false
for attempt in $(seq 1 30); do
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "Standalone server died"; exit 1; }
  if curl -sf http://localhost:3230 > /dev/null 2>&1; then
    SERVER_READY=true
    break
  fi
  echo "Waiting for Layout Guard standalone server ($attempt/30)..."
  sleep 1
done

if [ "$SERVER_READY" = "false" ]; then
  echo "::error::Layout Guard standalone server failed to start within 30s."
  exit 1
fi

node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- pnpm exec playwright test "${LAYOUT_GUARD_SPECS[@]}" --config=playwright.config.noauth.ts --project=chromium --reporter=line
