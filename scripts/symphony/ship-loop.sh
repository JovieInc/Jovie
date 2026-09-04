#!/bin/bash
# Cron/launchd wrapper: launch one ready codex kanban card shipper without
# blocking the scheduler. codex-kanban-ship.py can run >120s; Hermes gateway
# cron no-agent jobs time out at 120s, so this wrapper starts a single-flight
# background worker and exits.
set -uo pipefail

export PATH="${HOME}/.grok/bin:${HOME}/.local/bin:${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HERMES_SHIP=1

HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
LOCKDIR="${HERMES_HOME}/scripts/.locks/ship-loop-wrapper.lockd"
LOGDIR="${HERMES_HOME}/logs"
KANBAN_SHIP="${HERMES_HOME}/scripts/codex-kanban-ship.py"

mkdir -p "${HERMES_HOME}/scripts/.locks" "$LOGDIR"

pause_active() {
  [[ "${HERMES_PAUSE:-}" == "1" ]] && return 0
  [[ -f "${HERMES_HOME}/PAUSE" ]] && return 0
  [[ -f "${HERMES_HOME}/shipping-paused" ]] && return 0
  return 1
}

if pause_active; then
  echo "$(date -u +%FT%TZ) ship-loop SKIP: pause sentinel active (HERMES_PAUSE/PAUSE/shipping-paused)" \
    | tee -a "${LOGDIR}/ship-loop.log"
  exit 0
fi

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "ship-loop already launched/running (wrapper lock held); skipping"
  exit 0
fi

if [[ ! -f "$KANBAN_SHIP" ]]; then
  echo "$(date -u +%FT%TZ) ship-loop ABORT: missing ${KANBAN_SHIP}" | tee -a "${LOGDIR}/ship-loop.log"
  rm -rf "$LOCKDIR"
  exit 2
fi

# --- gbrain preflight: fail closed if the brain is dead ---
# "Dead" = doctor can't run / times out / returns invalid JSON / status=error|fail.
# NOT gated on health_score quality (warnings are fine) — only reachability.
gbrain_alive() {
  local out status gbrain_bin
  gbrain_bin="${HERMES_GBRAIN_BIN:-${HERMES_HOME}/bin/gbrain}"
  if [[ ! -x "$gbrain_bin" ]]; then
    gbrain_bin="$(command -v gbrain || true)"
  fi
  if [[ -z "$gbrain_bin" ]]; then
    return 1
  fi
  out="$(timeout 30 "$gbrain_bin" doctor --fast --json 2>/dev/null)" || return 1
  [[ -z "$out" ]] && return 1
  status="$(printf '%s' "$out" | python3 -c 'import sys,json;
try:
    d=json.load(sys.stdin); print(d.get("status","")); sys.exit(0)
except Exception:
    sys.exit(1)' 2>/dev/null)" || return 1
  case "$status" in
    error|fail|failed|dead|"") return 1 ;;
    *) return 0 ;;
  esac
}

if ! gbrain_alive; then
  echo "$(date -u +%FT%TZ) ship-loop ABORT: gbrain is dead/unreachable — refusing to ship blind" \
    | tee -a "${LOGDIR}/ship-loop.log"
  rm -rf "$LOCKDIR"
  exit 3
fi

echo "$(date -u +%FT%TZ) ship-loop preflight OK: gbrain alive" >>"${LOGDIR}/ship-loop.log"

(
  trap 'rm -rf "$LOCKDIR"' EXIT
  nohup python3 "$KANBAN_SHIP" --apply --coder-timeout 1800 >>"${LOGDIR}/ship-loop.log" 2>&1 &
  disown
) &
wait $! 2>/dev/null || true
echo "ship-loop launched background shipper log=${LOGDIR}/ship-loop.log"
exit 0