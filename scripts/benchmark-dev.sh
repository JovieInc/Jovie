#!/usr/bin/env bash
# Benchmark dev server cold start time.
# Usage: ./scripts/benchmark-dev.sh [runs]
# Default: 3 runs, averages the results.

set -euo pipefail

RUNS=${1:-3}
WEB_DIR="apps/web"
NEXT_DIR="$WEB_DIR/.next"
TMPFILE="/tmp/benchmark-dev-results.$$"
REPO_ROOT="$(pwd)"
TIMEOUT=120

# Ensure we're in the repo root
if [ ! -f "turbo.json" ]; then
  echo "Error: Run from repo root (where turbo.json lives)"
  exit 1
fi

rm -f "$TMPFILE"

echo "=== Dev Server Cold Start Benchmark ==="
echo "Runs: $RUNS"
echo ""

for i in $(seq 1 "$RUNS"); do
  echo "--- Run $i/$RUNS ---"

  # Kill any existing dev server (scoped to this repo to avoid killing unrelated processes)
  pkill -f "$REPO_ROOT.*next dev" 2>/dev/null || true
  sleep 1

  # Clear .next cache for true cold start
  rm -rf "$NEXT_DIR"
  echo "  Cleared .next cache"

  # Start dev server in background and time until "Ready" message.
  # Using process substitution so the while loop runs in the main shell
  # (not a subshell), allowing TMPFILE writes and proper flow control.
  START_S=$(date +%s)

  pnpm --filter web exec next dev --turbopack > "/tmp/benchmark-dev-output.$$" 2>&1 &
  DEV_PID=$!

  READY=false
  DEADLINE=$((START_S + TIMEOUT))
  while [ "$(date +%s)" -lt "$DEADLINE" ]; do
    if [ -f "/tmp/benchmark-dev-output.$$" ]; then
      while IFS= read -r line; do
        echo "  $line"
        if echo "$line" | grep -qiE "(Ready in|✓ Ready)"; then
          END_S=$(date +%s)
          ELAPSED=$((END_S - START_S))
          echo ""
          echo "  >>> COLD START: ${ELAPSED}s"
          echo "$ELAPSED" >> "$TMPFILE"
          READY=true
          break 2
        fi
      done < "/tmp/benchmark-dev-output.$$"
    fi
    sleep 0.5
  done

  if [ "$READY" = false ]; then
    echo "  >>> TIMED OUT after ${TIMEOUT}s"
  fi

  # Kill the dev server
  kill "$DEV_PID" 2>/dev/null || true
  wait "$DEV_PID" 2>/dev/null || true
  pkill -f "$REPO_ROOT.*next dev" 2>/dev/null || true
  rm -f "/tmp/benchmark-dev-output.$$"

  sleep 2
done

# Read results and compute average
if [ -f "$TMPFILE" ]; then
  echo ""
  echo "=== Results ==="
  TOTAL=0
  COUNT=0
  while IFS= read -r secs; do
    COUNT=$((COUNT + 1))
    echo "  Run $COUNT: ${secs}s"
    TOTAL=$((TOTAL + secs))
  done < "$TMPFILE"

  if [ "$COUNT" -gt 0 ]; then
    AVG=$((TOTAL / COUNT))
    echo ""
    echo "  Average: ${AVG}s"
  fi

  rm -f "$TMPFILE"
else
  echo ""
  echo "No results captured. The dev server may not have started correctly."
  echo "Try running manually: pnpm --filter web exec next dev --turbopack"
fi
