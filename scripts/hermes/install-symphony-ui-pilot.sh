#!/usr/bin/env bash
# install-symphony-ui-pilot.sh — deterministic installer for the supervised
# Symphony UI pilot runtime on gem (JOV-4962).
#
# The repo is the source of truth for the versioned workflow, the systemd
# user units, lease guard (JOV-5031), and durable stopped-work reconciler. This script materializes them
# onto the host with timestamped backups and reloads the user systemd manager.
# It NEVER starts, stops, or restarts the service and never kills a running
# process — draining active leases before swapping the runtime is a separate,
# deliberate operation.
#
# Modes:
#   (default)          install workflow + unit + lease guard, then daemon-reload
#   --check            verify installed files match the repo sources; no writes
#   --no-daemon-reload install files but skip systemctl --user daemon-reload
#   --lease-guard-only restore only the executable lease guard atomically;
#                      never reload systemd or touch workflow/unit files
#
# SYMPHONY_UI_PILOT_HOME overrides the target home (used by regression tests).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_UI_PILOT_HOME:-$HOME}"

WORKFLOW_SRC="$REPO_ROOT/scripts/hermes/WORKFLOW.jovie-ui-pilot.md"
UNIT_SRC="$REPO_ROOT/scripts/hermes/systemd/symphony-ui-pilot.service"
GUARD_SRC="$REPO_ROOT/scripts/hermes/symphony-lease-guard"
RECONCILER_SRC="$REPO_ROOT/scripts/hermes/symphony-reconciler.py"
MODEL_ROUTER_SRC="$REPO_ROOT/scripts/hermes/model-router.py"
MODEL_REGISTRY_SRC="$REPO_ROOT/scripts/hermes/config/model-registry.json"
CAPABILITY_MANIFEST_SRC="$REPO_ROOT/scripts/hermes/config/symphony-reconciler-capabilities.json"
RECONCILER_SERVICE_SRC="$REPO_ROOT/scripts/hermes/systemd/symphony-reconciler.service"
RECONCILER_TIMER_SRC="$REPO_ROOT/scripts/hermes/systemd/symphony-reconciler.timer"
WORKFLOW_DST="$TARGET_HOME/symphony-runtime/elixir/WORKFLOW.jovie-ui-pilot.md"
UNIT_DST="$TARGET_HOME/.config/systemd/user/symphony-ui-pilot.service"
GUARD_DST="$TARGET_HOME/.local/bin/symphony-lease-guard"
RECONCILER_DST="$TARGET_HOME/.local/bin/symphony-reconciler"
MODEL_ROUTER_DST="$TARGET_HOME/.local/lib/symphony-reconciler/model-router.py"
MODEL_REGISTRY_DST="$TARGET_HOME/.local/lib/symphony-reconciler/model-registry.json"
CAPABILITY_MANIFEST_DST="$TARGET_HOME/.local/lib/symphony-reconciler/symphony-reconciler-capabilities.json"
RUNTIME_RECEIPT_DST="$TARGET_HOME/.local/lib/symphony-reconciler/runtime-receipt.json"
RECONCILER_SERVICE_DST="$TARGET_HOME/.config/systemd/user/symphony-reconciler.service"
RECONCILER_TIMER_DST="$TARGET_HOME/.config/systemd/user/symphony-reconciler.timer"

CHECK_ONLY=0
DAEMON_RELOAD=1
LEASE_GUARD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-daemon-reload) DAEMON_RELOAD=0 ;;
    --lease-guard-only) LEASE_GUARD_ONLY=1; DAEMON_RELOAD=0 ;;
    *) echo "usage: $0 [--check] [--no-daemon-reload] [--lease-guard-only]" >&2; exit 2 ;;
  esac
done

install_one() {
  local src="$1" dst="$2" mode="${3:-0644}"
  if [ ! -f "$src" ]; then
    echo "MISSING_SOURCE $src" >&2
    return 1
  fi
  local dst_dir tmp
  dst_dir="$(dirname "$dst")"
  mkdir -p "$dst_dir"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    local backup
    backup="$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$dst" "$backup"
    echo "BACKUP $backup"
  fi
  tmp="$(mktemp "$dst_dir/.$(basename "$dst").tmp.XXXXXX")"
  if ! install -m "$mode" "$src" "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv -f "$tmp" "$dst"
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
  if [ "$LEASE_GUARD_ONLY" -eq 0 ]; then
    check_one "$WORKFLOW_SRC" "$WORKFLOW_DST" || rc=1
    check_one "$UNIT_SRC" "$UNIT_DST" || rc=1
    check_one "$RECONCILER_SRC" "$RECONCILER_DST" || rc=1
    check_one "$MODEL_ROUTER_SRC" "$MODEL_ROUTER_DST" || rc=1
    check_one "$MODEL_REGISTRY_SRC" "$MODEL_REGISTRY_DST" || rc=1
    check_one "$CAPABILITY_MANIFEST_SRC" "$CAPABILITY_MANIFEST_DST" || rc=1
    check_one "$RECONCILER_SERVICE_SRC" "$RECONCILER_SERVICE_DST" || rc=1
    check_one "$RECONCILER_TIMER_SRC" "$RECONCILER_TIMER_DST" || rc=1
    if [ -f "$RUNTIME_RECEIPT_DST" ]; then
      if ! SYMPHONY_MODEL_ROUTER="$MODEL_ROUTER_DST" \
        SYMPHONY_MODEL_REGISTRY="$MODEL_REGISTRY_DST" \
        SYMPHONY_RUNTIME_CAPABILITY_MANIFEST="$CAPABILITY_MANIFEST_DST" \
        SYMPHONY_RUNTIME_RECEIPT="$RUNTIME_RECEIPT_DST" \
        python3 "$RECONCILER_DST" runtime-preflight >/dev/null; then
        echo "DRIFT $RUNTIME_RECEIPT_DST"
        rc=1
      else
        echo "OK $RUNTIME_RECEIPT_DST"
      fi
    else
      echo "MISSING $RUNTIME_RECEIPT_DST"
      rc=1
    fi
  fi
  check_one "$GUARD_SRC" "$GUARD_DST" || rc=1
  exit "$rc"
fi

if [ "$LEASE_GUARD_ONLY" -eq 0 ]; then
  install_one "$WORKFLOW_SRC" "$WORKFLOW_DST"
  install_one "$UNIT_SRC" "$UNIT_DST"
  install_one "$RECONCILER_SRC" "$RECONCILER_DST" 0755
  install_one "$MODEL_ROUTER_SRC" "$MODEL_ROUTER_DST" 0755
  install_one "$MODEL_REGISTRY_SRC" "$MODEL_REGISTRY_DST"
  install_one "$CAPABILITY_MANIFEST_SRC" "$CAPABILITY_MANIFEST_DST"
  SYMPHONY_MODEL_ROUTER="$MODEL_ROUTER_DST" \
    SYMPHONY_MODEL_REGISTRY="$MODEL_REGISTRY_DST" \
    SYMPHONY_RUNTIME_CAPABILITY_MANIFEST="$CAPABILITY_MANIFEST_DST" \
    SYMPHONY_RUNTIME_RECEIPT="$RUNTIME_RECEIPT_DST" \
    python3 "$RECONCILER_DST" runtime-receipt >/dev/null
  echo "INSTALLED $RUNTIME_RECEIPT_DST"
  install_one "$RECONCILER_SERVICE_SRC" "$RECONCILER_SERVICE_DST"
  install_one "$RECONCILER_TIMER_SRC" "$RECONCILER_TIMER_DST"
fi
install_one "$GUARD_SRC" "$GUARD_DST" 0755

if [ "$DAEMON_RELOAD" -eq 1 ]; then
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  systemctl --user daemon-reload
  echo "DAEMON_RELOADED"
fi

echo "DONE"
