#!/usr/bin/env bash
# Measure the local Next.js dev loop: server ready, first route compile, and warm route response.
# Usage:
#   pnpm run benchmark:dev
#   ./scripts/benchmark-dev.sh [runs] [route ...]
#
# Environment:
#   BENCHMARK_DEV_ROUTES="/ /app /api/health/build-info"
#   BENCHMARK_DEV_PORT=3100
#   BENCHMARK_DEV_TIMEOUT=120
#   JOVIE_DEV_RESET_NEXT_CACHE=1  # remove .next before each run for cold-start measurement

set -euo pipefail

RUNS="${1:-1}"
if [[ "$RUNS" =~ ^[0-9]+$ ]]; then
  shift || true
else
  RUNS=1
fi

REPO_ROOT="$(pwd)"
WEB_DIR="apps/web"
NEXT_DIR="$WEB_DIR/.next"
BASE_PORT="${BENCHMARK_DEV_PORT:-3100}"
TIMEOUT="${BENCHMARK_DEV_TIMEOUT:-120}"
OUTPUT_DIR="${TMPDIR:-/tmp}"
RESULTS_FILE="$OUTPUT_DIR/jovie-dev-benchmark-results.$$"
LOG_FILE="$OUTPUT_DIR/jovie-dev-benchmark-output.$$"

if [ ! -f "turbo.json" ]; then
  echo "Error: Run from repo root (where turbo.json lives)"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  ROUTES=("$@")
elif [ -n "${BENCHMARK_DEV_ROUTES:-}" ]; then
  # shellcheck disable=SC2206
  ROUTES=(${BENCHMARK_DEV_ROUTES})
else
  ROUTES=("/" "/app" "/api/health/build-info")
fi

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

find_free_port() {
  local port="$1"
  while lsof -ti "tcp:$port" >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "$port"
}

cleanup() {
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
    wait "$DEV_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

request_route() {
  local route="$1"
  local url="$2"
  curl -sS -o /dev/null -w "${route} %{http_code} %{time_total}" "$url"
}

echo "=== Jovie Local Dev Benchmark ==="
echo "Runs: $RUNS"
echo "Routes: ${ROUTES[*]}"
echo "Base port: $BASE_PORT"
echo ""

rm -f "$RESULTS_FILE"

for run in $(seq 1 "$RUNS"); do
  echo "--- Run $run/$RUNS ---"

  pkill -f "$REPO_ROOT.*next dev" 2>/dev/null || true
  sleep 1

  if [ "${JOVIE_DEV_RESET_NEXT_CACHE:-0}" = "1" ]; then
    rm -rf "$NEXT_DIR"
    echo "  Reset .next for cold measurement"
  else
    echo "  Keeping existing .next cache"
  fi

  PORT="$(find_free_port "$BASE_PORT")"
  if [ "$PORT" != "$BASE_PORT" ]; then
    echo "  Port $BASE_PORT is busy; using measured port $PORT"
  fi

  rm -f "$LOG_FILE"
  START_MS="$(now_ms)"
  pnpm --filter @jovie/web exec next dev -p "$PORT" >"$LOG_FILE" 2>&1 &
  DEV_PID=$!

  READY=false
  DEADLINE=$(( $(date +%s) + TIMEOUT ))
  while [ "$(date +%s)" -lt "$DEADLINE" ]; do
    if ! kill -0 "$DEV_PID" >/dev/null 2>&1; then
      echo "  Dev server exited before ready"
      sed 's/^/  /' "$LOG_FILE" || true
      exit 1
    fi

    if grep -qiE "(Ready in|Local:)" "$LOG_FILE" 2>/dev/null; then
      READY=true
      break
    fi

    sleep 0.25
  done

  if [ "$READY" != "true" ]; then
    echo "  Timed out waiting for dev server after ${TIMEOUT}s"
    sed 's/^/  /' "$LOG_FILE" || true
    exit 1
  fi

  READY_MS=$(( $(now_ms) - START_MS ))
  echo "  Ready: ${READY_MS}ms"

  BASE_URL="http://localhost:$PORT"
  for route in "${ROUTES[@]}"; do
    FIRST_LINE="$(request_route "$route" "$BASE_URL$route")"
    WARM_LINE="$(request_route "$route" "$BASE_URL$route")"
    FIRST_STATUS="$(printf '%s' "$FIRST_LINE" | awk '{print $2}')"
    FIRST_SECONDS="$(printf '%s' "$FIRST_LINE" | awk '{print $3}')"
    WARM_STATUS="$(printf '%s' "$WARM_LINE" | awk '{print $2}')"
    WARM_SECONDS="$(printf '%s' "$WARM_LINE" | awk '{print $3}')"

    printf '  %-28s first=%ss status=%s warm=%ss status=%s\n' \
      "$route" "$FIRST_SECONDS" "$FIRST_STATUS" "$WARM_SECONDS" "$WARM_STATUS"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$run" "$route" "$READY_MS" "$FIRST_SECONDS" "$FIRST_STATUS" "$WARM_SECONDS" >>"$RESULTS_FILE"
  done

  kill "$DEV_PID" >/dev/null 2>&1 || true
  wait "$DEV_PID" >/dev/null 2>&1 || true
  DEV_PID=""
  rm -f "$LOG_FILE"
  echo ""
done

if [ -f "$RESULTS_FILE" ]; then
  echo "=== Results ==="
  awk -F '\t' '
    {
      route=$2
      count[route] += 1
      ready[route] += $3
      first[route] += $4
      warm[route] += $6
    }
    END {
      for (route in count) {
        printf "  %-28s ready_avg=%.0fms first_avg=%.3fs warm_avg=%.3fs\n", route, ready[route]/count[route], first[route]/count[route], warm[route]/count[route]
      }
    }
  ' "$RESULTS_FILE"
  rm -f "$RESULTS_FILE"
fi
