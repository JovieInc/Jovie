#!/usr/bin/env bash
# Fast local web dev entrypoint with pinned Doppler scope and stable auth bypass defaults.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3100}"
LOG_FILE="${TMPDIR:-/tmp}/jovie-dev-web-fast-$$.log"
WARM_ROUTES="${JOVIE_DEV_WARM_ROUTES:-/ /app /api/health/build-info}"

set +e
node - "$PORT" <<'NODE'
const net = require('node:net');
const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.exit(2);
}

const server = net.createServer();
server.once('error', error => {
  process.exit(error.code === 'EADDRINUSE' ? 42 : 1);
});
server.once('listening', () => {
  server.close(() => process.exit(0));
});
server.listen(port);
NODE
PORT_STATUS=$?
set -e

if [ "$PORT_STATUS" -eq 42 ]; then
  echo "Port $PORT is already in use. Stop that server or run: PORT=$((PORT + 1)) pnpm run dev:web:fast" >&2
  exit 1
fi
if [ "$PORT_STATUS" -ne 0 ]; then
  echo "Unable to verify whether port $PORT is available. Check PORT and try again." >&2
  exit 1
fi

cd "$REPO_ROOT"

cleanup() {
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
    wait "$DEV_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${TAIL_PID:-}" ]; then
    kill "$TAIL_PID" >/dev/null 2>&1 || true
    wait "$TAIL_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT INT TERM

doppler run --project jovie-web --config dev -- env \
  E2E_USE_TEST_AUTH_BYPASS="${E2E_USE_TEST_AUTH_BYPASS:-1}" \
  NEXT_PUBLIC_CLERK_MOCK="${NEXT_PUBLIC_CLERK_MOCK:-1}" \
  NEXT_PUBLIC_CLERK_PROXY_DISABLED="${NEXT_PUBLIC_CLERK_PROXY_DISABLED:-1}" \
  NEXT_DISABLE_TOOLBAR="${NEXT_DISABLE_TOOLBAR:-1}" \
  JOVIE_ENABLE_LOCAL_SENTRY="${JOVIE_ENABLE_LOCAL_SENTRY:-0}" \
  PORT="$PORT" \
  pnpm --filter @jovie/web run dev:fast >"$LOG_FILE" 2>&1 &
DEV_PID=$!

tail -f "$LOG_FILE" &
TAIL_PID=$!

DEADLINE=$(( $(date +%s) + ${JOVIE_DEV_READY_TIMEOUT:-120} ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! kill -0 "$DEV_PID" >/dev/null 2>&1; then
    wait "$DEV_PID"
    exit $?
  fi

  if grep -qiE "(Ready in|Local:)" "$LOG_FILE" 2>/dev/null; then
    break
  fi

  sleep 0.25
done

if ! grep -qiE "(Ready in|Local:)" "$LOG_FILE" 2>/dev/null; then
  echo "Timed out waiting for dev server readiness on port $PORT" >&2
  exit 1
fi

echo ""
echo "Prewarming local routes: $WARM_ROUTES"
for route in $WARM_ROUTES; do
  curl -sS -o /dev/null "http://localhost:$PORT$route" || true
done
echo "Prewarm complete. Open http://localhost:$PORT"

wait "$DEV_PID"
