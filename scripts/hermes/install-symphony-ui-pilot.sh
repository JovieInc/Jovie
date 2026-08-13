#!/usr/bin/env bash
# install-symphony-ui-pilot.sh — deterministic installer for the supervised
# Symphony UI pilot runtime on gem (JOV-4962).
#
# The repo is the source of truth for the versioned workflow, the systemd
# user unit, and the lease guard (JOV-5031). This script materializes them
# onto the host with timestamped backups and reloads the user systemd manager.
# It NEVER starts, stops, or restarts the service and never kills a running
# process — draining active leases before swapping the runtime is a separate,
# deliberate operation.
#
# Modes:
#   (default)          install workflow + unit + lease guard, then daemon-reload
#   --check            verify installed files match the repo sources; no writes
#   --no-daemon-reload install files but skip systemctl --user daemon-reload
#
# SYMPHONY_UI_PILOT_HOME overrides the target home (used by regression tests).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_UI_PILOT_HOME:-$HOME}"

WORKFLOW_SRC="$REPO_ROOT/scripts/hermes/WORKFLOW.jovie-ui-pilot.md"
UNIT_SRC="$REPO_ROOT/scripts/hermes/systemd/symphony-ui-pilot.service"
GUARD_SRC="$REPO_ROOT/scripts/hermes/symphony-lease-guard"
WORKFLOW_DST="$TARGET_HOME/symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
UNIT_DST="$TARGET_HOME/.config/systemd/user/symphony-ui-pilot.service"
GUARD_DST="$TARGET_HOME/.local/bin/symphony-lease-guard"

CHECK_ONLY=0
DAEMON_RELOAD=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-daemon-reload) DAEMON_RELOAD=0 ;;
    *) echo "usage: $0 [--check] [--no-daemon-reload]" >&2; exit 2 ;;
  esac
done

install_one() {
  local src="$1" dst="$2" mode="${3:-0644}"
  if [ ! -f "$src" ]; then
    echo "MISSING_SOURCE $src" >&2
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    local backup
    backup="$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$dst" "$backup"
    echo "BACKUP $backup"
  fi
  install -m "$mode" "$src" "$dst"
  echo "INSTALLED $dst"
}

check_one() {
  local src="$1" dst="$2" rc=0
  if [ ! -f "$dst" ]; then
    echo "MISSING $dst"
    return 1
  fi
  if cmp -s "$src" "$dst"; then
    echo "OK $dst"
  else
    echo "DRIFT $dst"
    rc=1
  fi
  return "$rc"
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  rc=0
  check_one "$WORKFLOW_SRC" "$WORKFLOW_DST" || rc=1
  check_one "$UNIT_SRC" "$UNIT_DST" || rc=1
  check_one "$GUARD_SRC" "$GUARD_DST" || rc=1
  exit "$rc"
fi

install_one "$WORKFLOW_SRC" "$WORKFLOW_DST"
install_one "$UNIT_SRC" "$UNIT_DST"
install_one "$GUARD_SRC" "$GUARD_DST" 0755

if [ "$DAEMON_RELOAD" -eq 1 ]; then
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  fi
  systemctl --user daemon-reload
  echo "DAEMON_RELOADED"
fi

echo "DONE"
