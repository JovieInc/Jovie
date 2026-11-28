#!/usr/bin/env bash
set -euo pipefail
SMOKE_ROOT="$RUNNER_TEMP/visual-compare-smoke/apps/web"
mkdir -p "$SMOKE_ROOT"
tar -xf "$RUNNER_TEMP/visual-compare-build.tar" -C "$SMOKE_ROOT"
export HOSTNAME=localhost
PORT=3231 node "$SMOKE_ROOT/.next/standalone/apps/web/server.js" > "$RUNNER_TEMP/visual-compare-smoke-server.log" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT
SMOKE_READY=false
SMOKE_DEADLINE=$((SECONDS + 45))
while [ "$SECONDS" -lt "$SMOKE_DEADLINE" ]; do
  # A dead server must fail the smoke immediately, never ride the
  # full deadline: probe liveness first, readiness second.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID" 2>/dev/null || true
    cat "$RUNNER_TEMP/visual-compare-smoke-server.log"
    echo "::error::Packaged visual compare build server exited during the smoke probe."
    exit 1
  fi
  if curl -sf --connect-timeout 2 --max-time 5 http://localhost:3231 > /dev/null 2>&1; then
    SMOKE_READY=true
    break
  fi
  sleep 1
done
if [ "$SMOKE_READY" = "false" ]; then
  cat "$RUNNER_TEMP/visual-compare-smoke-server.log"
  echo "::error::Packaged visual compare build did not serve within the deadline; refusing to publish."
  exit 1
fi
echo "Packaged visual compare build serves on localhost:3231."
