#!/usr/bin/env bash
# Report or terminate stale Next.js / turbo dev processes.
#
# Usage:
#   pnpm run dev:cleanup              # dry-run (default)
#   pnpm run dev:cleanup:force        # send SIGTERM to stale processes
#   JOVIE_STALE_DEV_MAX_AGE_HOURS=1 pnpm run dev:cleanup
#
# Matches: next dev, next-server, and turbo dev parent shells.
set -euo pipefail

MAX_AGE_HOURS="${JOVIE_STALE_DEV_MAX_AGE_HOURS:-4}"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) FORCE=0 ;;
    -h | --help)
      cat <<'EOF'
Usage: cleanup-stale-dev.sh [--dry-run|--force]

Find Next.js / turbo dev processes older than JOVIE_STALE_DEV_MAX_AGE_HOURS
(default: 4) and print them. Pass --force to send SIGTERM.

Environment:
  JOVIE_STALE_DEV_MAX_AGE_HOURS  Age threshold in hours (default: 4)
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if ! [[ "$MAX_AGE_HOURS" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "JOVIE_STALE_DEV_MAX_AGE_HOURS must be a positive number (got: $MAX_AGE_HOURS)" >&2
  exit 1
fi

MAX_AGE_SECONDS="$(node -e "process.stdout.write(String(Math.floor(Number(process.argv[1]) * 3600)))" "$MAX_AGE_HOURS")"

STALE_PIDS=()
while IFS= read -r line; do
  STALE_PIDS+=("$line")
done < <(
  ps -axo pid=,etime=,command= |
    node - "$MAX_AGE_SECONDS" <<'NODE'
const fs = require('node:fs');
const maxAgeSeconds = Number(process.argv[2]);
const input = fs.readFileSync(0, 'utf8');

function parseElapsedSeconds(raw) {
  const value = raw.trim();
  if (!value) return null;

  if (value.includes('-')) {
    const [days, time] = value.split('-');
    const [hours = '0', minutes = '0', seconds = '0'] = time.split(':');
    return (
      Number(days) * 86_400 +
      Number(hours) * 3_600 +
      Number(minutes) * 60 +
      Number(seconds)
    );
  }

  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3_600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0];
}

function isDevProcess(command) {
  return (
    /\bnext dev\b/.test(command) ||
    /\bnext-server\b/.test(command) ||
    (/\bturbo dev\b/.test(command) && !/\bgrep\b/.test(command))
  );
}

const stale = [];

for (const line of input.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const match = trimmed.match(/^(\d+)\s+(\S+)\s+(.*)$/);
  if (!match) continue;

  const pid = Number(match[1]);
  const elapsedSeconds = parseElapsedSeconds(match[2]);
  const command = match[3];

  if (!Number.isInteger(pid) || elapsedSeconds === null) continue;
  if (!isDevProcess(command)) continue;
  if (elapsedSeconds < maxAgeSeconds) continue;

  stale.push({ pid, elapsed: match[2], command });
}

for (const entry of stale) {
  process.stdout.write(`${entry.pid}\t${entry.elapsed}\t${entry.command}\n`);
}
NODE
)

if [ "${#STALE_PIDS[@]}" -eq 0 ]; then
  echo "No stale dev processes found (threshold: ${MAX_AGE_HOURS}h)."
  exit 0
fi

echo "Stale dev processes (>= ${MAX_AGE_HOURS}h):"
for line in "${STALE_PIDS[@]}"; do
  printf '  %s\n' "$line"
done

if [ "$FORCE" -eq 0 ]; then
  echo ""
  echo "Dry-run only. Re-run with --force or: pnpm run dev:cleanup:force"
  exit 0
fi

echo ""
echo "Sending SIGTERM..."
for line in "${STALE_PIDS[@]}"; do
  pid="${line%%$'\t'*}"
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    echo "  terminated pid $pid"
  fi
done