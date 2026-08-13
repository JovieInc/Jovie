#!/usr/bin/env bash
# install-symphony-grok-sidecar.sh — deterministic, exact-main installer for the
# versioned Symphony Grok sidecar systemd user units (JOV-5027).
#
# The repo is the source of truth for the sidecar service and timer. This
# script installs both units onto the host ONLY from an exact origin/main
# checkout (HEAD must equal origin/main and the unit sources must be clean),
# then writes an install receipt binding the exact source SHA and unit hashes.
# It NEVER starts, stops, enables, or disables any unit and never runs
# reset-failed — it only materializes files and reloads the user systemd
# manager. Enabling the timer and clearing stale failed state from the
# pre-versioned unit are separate, deliberate operations.
#
# Exit-status classification is declared by the unit itself
# (SuccessExitStatus=0 2): exit 2 is the controller's typed safe fail-closed
# result; exit 3 (degraded handoff) and every other non-zero status remain
# real unit failures.
#
# Modes:
#   (default)          verify exact main, install units + receipt, daemon-reload
#   --check            verify installed units match the repo sources and the
#                      receipt is present, well-formed, and exact-main bound;
#                      no writes
#   --no-daemon-reload install files but skip systemctl --user daemon-reload
#
# SYMPHONY_GROK_SIDECAR_HOME overrides the target home (used by regression
# tests).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_GROK_SIDECAR_HOME:-$HOME}"

UNIT_NAMES=("symphony-grok-sidecar.service" "symphony-grok-sidecar.timer")
UNIT_DST_DIR="$TARGET_HOME/.config/systemd/user"
RECEIPT_DIR="$TARGET_HOME/.local/state/symphony-grok-sidecar"
RECEIPT="$RECEIPT_DIR/install-receipt.json"
RECEIPT_SCHEMA="symphony-grok-sidecar-install/v1"

CHECK_ONLY=0
DAEMON_RELOAD=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-daemon-reload) DAEMON_RELOAD=0 ;;
    *) echo "usage: $0 [--check] [--no-daemon-reload]" >&2; exit 2 ;;
  esac
done

source_path() {
  printf '%s/scripts/hermes/systemd/%s' "$REPO_ROOT" "$1"
}

require_sources() {
  local name
  for name in "${UNIT_NAMES[@]}"; do
    if [ ! -f "$(source_path "$name")" ]; then
      echo "MISSING_SOURCE $(source_path "$name")" >&2
      exit 2
    fi
  done
}

# Exact-main gate: the install must come from a checkout whose HEAD is exactly
# origin/main with clean unit sources, so the receipt proves a deterministic
# source. Prints the HEAD sha on success.
require_exact_main() {
  local head_sha main_sha paths=()
  local name
  for name in "${UNIT_NAMES[@]}"; do
    paths+=("scripts/hermes/systemd/$name")
  done
  if ! head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)"; then
    echo "NOT_A_GIT_CHECKOUT $REPO_ROOT" >&2
    exit 2
  fi
  if ! main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null)"; then
    echo "ORIGIN_MAIN_UNAVAILABLE $REPO_ROOT" >&2
    exit 2
  fi
  if [ "$head_sha" != "$main_sha" ]; then
    echo "NOT_EXACT_MAIN head=$head_sha origin/main=$main_sha" >&2
    exit 2
  fi
  if ! git -C "$REPO_ROOT" diff --quiet -- "${paths[@]}" \
    || ! git -C "$REPO_ROOT" diff --cached --quiet -- "${paths[@]}"; then
    echo "DIRTY_SOURCES ${paths[*]}" >&2
    exit 2
  fi
  printf '%s' "$head_sha"
}

write_receipt() {
  local head_sha="$1"
  mkdir -p "$RECEIPT_DIR"
  RECEIPT_PATH="$RECEIPT" RECEIPT_SCHEMA_VALUE="$RECEIPT_SCHEMA" \
  RECEIPT_HEAD="$head_sha" RECEIPT_UNITS="${UNIT_NAMES[*]}" \
  RECEIPT_DST_DIR="$UNIT_DST_DIR" python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import time

receipt_path = pathlib.Path(os.environ["RECEIPT_PATH"])
units = {}
for name in os.environ["RECEIPT_UNITS"].split():
    data = (pathlib.Path(os.environ["RECEIPT_DST_DIR"]) / name).read_bytes()
    units[name] = hashlib.sha256(data).hexdigest()
head = os.environ["RECEIPT_HEAD"]
payload = {
    "schema": os.environ["RECEIPT_SCHEMA_VALUE"],
    "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": {"head": head, "originMain": head},
    "units": units,
}
temporary = receipt_path.with_name(f".{receipt_path.name}.tmp")
temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
temporary.replace(receipt_path)
PY
  echo "RECEIPT $RECEIPT"
}

check_one() {
  local name="$1" src dst rc=0
  src="$(source_path "$name")"
  dst="$UNIT_DST_DIR/$name"
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

check_receipt() {
  if [ ! -f "$RECEIPT" ]; then
    echo "MISSING $RECEIPT"
    return 1
  fi
  RECEIPT_PATH="$RECEIPT" RECEIPT_SCHEMA_VALUE="$RECEIPT_SCHEMA" \
  RECEIPT_UNITS="${UNIT_NAMES[*]}" RECEIPT_DST_DIR="$UNIT_DST_DIR" python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import sys

try:
    payload = json.loads(pathlib.Path(os.environ["RECEIPT_PATH"]).read_text(encoding="utf-8"))
except (OSError, ValueError):
    print("RECEIPT_INVALID", file=sys.stderr)
    sys.exit(1)
source = payload.get("source") if isinstance(payload, dict) else None
units = payload.get("units") if isinstance(payload, dict) else None
valid = (
    payload.get("schema") == os.environ["RECEIPT_SCHEMA_VALUE"]
    and isinstance(source, dict)
    and isinstance(source.get("head"), str)
    and source.get("head") == source.get("originMain")
    and isinstance(units, dict)
)
if valid:
    for name in os.environ["RECEIPT_UNITS"].split():
        try:
            digest = hashlib.sha256(
                (pathlib.Path(os.environ["RECEIPT_DST_DIR"]) / name).read_bytes()
            ).hexdigest()
        except OSError:
            valid = False
            break
        if units.get(name) != digest:
            valid = False
            break
if not valid:
    print("RECEIPT_INVALID", file=sys.stderr)
    sys.exit(1)
print("RECEIPT_OK")
PY
}

require_sources

if [ "$CHECK_ONLY" -eq 1 ]; then
  rc=0
  for name in "${UNIT_NAMES[@]}"; do
    check_one "$name" || rc=1
  done
  check_receipt || rc=1
  exit "$rc"
fi

HEAD_SHA="$(require_exact_main)"

for name in "${UNIT_NAMES[@]}"; do
  src="$(source_path "$name")"
  dst="$UNIT_DST_DIR/$name"
  mkdir -p "$UNIT_DST_DIR"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    backup="$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$dst" "$backup"
    echo "BACKUP $backup"
  fi
  install -m 0644 "$src" "$dst"
  echo "INSTALLED $dst"
done

write_receipt "$HEAD_SHA"

if [ "$DAEMON_RELOAD" -eq 1 ]; then
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  fi
  systemctl --user daemon-reload
  echo "DAEMON_RELOADED"
fi

echo "DONE"
