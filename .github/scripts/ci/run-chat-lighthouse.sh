#!/usr/bin/env bash
cd apps/web

if [ -z "$E2E_CLERK_USER_ID" ]; then
  echo "E2E_CLERK_USER_ID not set — skipping chat Lighthouse."
  exit 0
fi

export E2E_USE_TEST_AUTH_BYPASS=1
export NEXT_PUBLIC_AUTH_MOCK=1
export NEXT_PUBLIC_AUTH_PROXY_DISABLED=1

if [ ! -f .next/standalone/apps/web/server.js ] || [ ! -f .next/standalone/apps/web/.next/BUILD_ID ]; then
  echo "Standalone server not found — chat Lighthouse cannot start."
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

pnpm run test:lighthouse:chat:pr
