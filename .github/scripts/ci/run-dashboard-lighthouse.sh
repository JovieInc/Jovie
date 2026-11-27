#!/usr/bin/env bash
cd apps/web

export E2E_USE_TEST_AUTH_BYPASS=1
export NEXT_PUBLIC_AUTH_MOCK=1
export NEXT_PUBLIC_AUTH_PROXY_DISABLED=1

if [ ! -f .next/standalone/apps/web/server.js ] || [ ! -f .next/standalone/apps/web/.next/BUILD_ID ]; then
  echo "Standalone server not found — dashboard Lighthouse cannot start."
  exit 1
fi

node .next/standalone/apps/web/server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

echo "Waiting for standalone server..."
SERVER_READY=false
for ((i = 1; i <= 30; i++)); do
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "Standalone server died"; exit 1; }
  if curl -s http://localhost:3000 > /dev/null; then
    SERVER_READY=true
    break
  fi
  sleep 1
done

if [ "$SERVER_READY" = "false" ]; then
  echo "Server failed to start within 30s."
  exit 1
fi

# Lighthouse and route specs load each page with a full document
# load. Click the sidebar and the mobile tabs too: only a click
# proves the shell still moves between dashboard pages client-side.
# shell-route-health opens every sidebar destination both ways and
# fails on console errors, uncaught exceptions and error boundaries.
# releases-first-paint-visual fails if the release list moves after
# it first paints.
# chat-history-switcher fails if opening the chat history menu
# shifts layout, drops frames, or breaks search and keyboard select.
# Blocking, and run first so a nav break fails fast.
node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- \
  pnpm exec playwright test tests/e2e/dashboard-click-navigation.spec.ts \
  tests/e2e/shell-nav-click-through.spec.ts \
  tests/e2e/shell-route-health.spec.ts \
  tests/e2e/releases-first-paint-visual.spec.ts \
  tests/e2e/chat-history-switcher.spec.ts \
  --config=playwright.config.noauth.ts --project=chromium --reporter=line
