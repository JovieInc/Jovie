#!/usr/bin/env bash
cd apps/web
mkdir -p tests/.auth
echo '{"cookies":[],"origins":[]}' > tests/.auth/user.json

cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

if [ ! -f .next/standalone/apps/web/server.js ] || [ ! -f .next/standalone/apps/web/.next/BUILD_ID ]; then
  echo "::error::Standalone server not found for authenticated a11y."
  exit 1
fi

# Same server-side env export as mobile-overflow / e2e-smoke so
# test-auth enter is available on the production-built standalone.
export VERCEL_ENV=development
export E2E_USE_TEST_AUTH_BYPASS=1
export E2E_TEST_AUTH_PERSONA=creator-ready
export NEXT_PUBLIC_E2E_MODE=1
export NEXT_PUBLIC_AUTH_MOCK=1
export NEXT_PUBLIC_AUTH_PROXY_DISABLED=1
export HOSTNAME=localhost

PORT=3270 node .next/standalone/apps/web/server.js &
SERVER_PID=$!
for ((i = 1; i <= 30; i++)); do
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "Standalone server died"; exit 1; }
  if curl -sf http://localhost:3270 > /dev/null 2>&1; then break; fi
  sleep 1
done

node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- pnpm exec playwright test \
  tests/e2e/a11y.spec.ts \
  tests/e2e/chat-axe.spec.ts \
  --config=playwright.config.ts --project=chromium
