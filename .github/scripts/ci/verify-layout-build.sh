#!/usr/bin/env bash
set -euo pipefail
cd apps/web
mapfile -t LAYOUT_GUARD_SPECS < <(node ../../.github/scripts/layout-guard-manifest.mjs)
mkdir -p tests/.auth
echo '{"cookies":[],"origins":[]}' > tests/.auth/user.json
export HOSTNAME=localhost
export NEXT_PUBLIC_APP_URL=http://localhost:3230

PORT=3230 node .next/standalone/apps/web/server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for ((attempt = 1; attempt <= 30; attempt++)); do
  kill -0 "$SERVER_PID" 2>/dev/null || {
    echo "::error::Combined-head standalone server died"
    exit 1
  }
  if curl -sf http://localhost:3230 >/dev/null 2>&1; then
    node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- \
      pnpm exec playwright test "${LAYOUT_GUARD_SPECS[@]}" \
        --config=playwright.config.noauth.ts --project=chromium --reporter=line
    exit 0
  fi
  sleep 1
done
echo "::error::Combined-head standalone server failed to start"
exit 1
