#!/usr/bin/env bash
# Deterministic local launcher and health check for the Ovie/HUD cockpit.
#
# Usage (from the repository root):
#   ./scripts/ovie-hud.sh start
#   ./scripts/ovie-hud.sh health
#   ./scripts/ovie-hud.sh status
#   ./scripts/ovie-hud.sh open
#
# The launcher never kills an existing process. It reuses a healthy local web
# server, otherwise starts an isolated server on OVIE_HUD_PORT (default 3100).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OVIE_HUD_PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
PID_FILE="${TMPDIR:-/tmp}/ovie-hud-${PORT}.pid"
LOG_FILE="${TMPDIR:-/tmp}/ovie-hud-${PORT}.log"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "Invalid OVIE_HUD_PORT: $PORT" >&2
  exit 2
fi

# /hud is the authenticated admin surface. /hud-tv is the token-only kiosk
# surface and is the deterministic local route probe because it renders its
# access fallback without requiring a Clerk session.
kiosk_url() {
  if [ -n "${HUD_KIOSK_TOKEN:-}" ]; then
    local encoded_token
    encoded_token="$(jq -nr --arg token "$HUD_KIOSK_TOKEN" '$token | @uri')"
    printf '%s/hud-tv?kiosk=%s\n' "$BASE_URL" "$encoded_token"
  else
    printf '%s/hud-tv\n' "$BASE_URL"
  fi
}

display_kiosk_url() {
  if [ -n "${HUD_KIOSK_TOKEN:-}" ]; then
    printf '%s/hud-tv?kiosk=<HUD_KIOSK_TOKEN>\n' "$BASE_URL"
  else
    printf '%s/hud-tv\n' "$BASE_URL"
  fi
}

probe() {
  local url="$1"
  local body_file="$2"
  local status
  status="$(curl -sS --max-time 8 -o "$body_file" -w '%{http_code}' "$url" || true)"
  printf '%s' "$status"
}

health() {
  local body_file
  body_file="${TMPDIR:-/tmp}/ovie-hud-health-${PORT}-$$.html"

  local url status
  url="$(kiosk_url)"
  status="$(probe "$url" "$body_file")"
  if [ "$status" != "200" ]; then
    echo "FAIL Ovie/HUD route: $(display_kiosk_url) (HTTP $status)" >&2
    rm -f "$body_file"
    return 1
  fi

  if ! grep -q 'hud-kiosk-viewport' "$body_file"; then
    echo "FAIL Ovie/HUD route did not render the kiosk cockpit: $(display_kiosk_url)" >&2
    rm -f "$body_file"
    return 1
  fi

  rm -f "$body_file"
  echo "OK Ovie/HUD route: $(display_kiosk_url) (HTTP 200)"
  echo "Admin route: ${BASE_URL}/hud (requires an authenticated admin session)"
  if [ -z "${HUD_KIOSK_TOKEN:-}" ]; then
    echo "Kiosk mode: not configured in this shell; use Doppler or export HUD_KIOSK_TOKEN without printing it."
  else
    echo "Kiosk mode: configured (token value not printed)."
  fi
}

server_is_up() {
  local status
  status="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' "$(kiosk_url)" || true)"
  [ "$status" = "200" ] || [ "$status" = "401" ] || [ "$status" = "403" ]
}

start() {
  if server_is_up; then
    echo "Reusing existing local web server on ${BASE_URL} (no process was killed)."
    health
    return 0
  fi

  if [ -f "$PID_FILE" ]; then
    old_pid="$(tr -d '[:space:]' < "$PID_FILE")"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" >/dev/null 2>&1; then
      echo "A previous Ovie/HUD launcher is still starting (pid $old_pid)."
      echo "Log: $LOG_FILE"
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  cd "$REPO_ROOT"
  echo "Starting isolated Ovie/HUD web server on ${BASE_URL}..."
  PORT="$PORT" JOVIE_DEV_WARM_ROUTES="/hud-tv" pnpm run dev:web:fast >"$LOG_FILE" 2>&1 &
  pid=$!
  printf '%s\n' "$pid" > "$PID_FILE"

  deadline=$(( $(date +%s) + ${OVIE_HUD_READY_TIMEOUT:-120} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if server_is_up; then
      echo "Started Ovie/HUD server (pid $pid)."
      health
      return 0
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "Ovie/HUD server exited before becoming ready. Log: $LOG_FILE" >&2
      return 1
    fi
    sleep 1
  done

  echo "Timed out waiting for ${BASE_URL}. Log: $LOG_FILE" >&2
  return 1
}

status() {
  echo "Repo: $REPO_ROOT"
  echo "Port: $PORT"
  echo "Admin URL: ${BASE_URL}/hud"
  echo "Kiosk URL: ${BASE_URL}/hud-tv?kiosk=<HUD_KIOSK_TOKEN>"
  if server_is_up; then
    echo "Server: reachable"
  else
    echo "Server: not reachable"
  fi
  if [ -f "$PID_FILE" ]; then
    echo "Launcher PID file: $PID_FILE ($(tr -d '[:space:]' < "$PID_FILE"))"
  fi
  echo "Log: $LOG_FILE"
}

case "${1:-health}" in
  start) start ;;
  health) health ;;
  status) status ;;
  open)
    health >/dev/null
    if [ -n "${HUD_KIOSK_TOKEN:-}" ]; then
      open "$(kiosk_url)"
    else
      open "${BASE_URL}/hud-tv"
    fi
    ;;
  *)
    echo "Usage: $0 {start|health|status|open}" >&2
    exit 2
    ;;
esac