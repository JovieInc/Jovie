#!/usr/bin/env bash
# install-cursor-cli-worker.sh — deterministic installer for the versioned
# Symphony Cursor CLI worker units and known-good GEM_CURSOR_EXECUTABLE path.
#
# The repo is the source of truth for the worker, wrapper, service, and timer.
# This script installs those files onto the host ONLY from an exact origin/main
# checkout (HEAD must equal origin/main and the sources must be clean), then
# writes an install receipt binding the exact source SHA and file hashes.
# It NEVER starts, stops, enables, or disables any unit and never runs
# reset-failed — it only materializes files and reloads the user systemd
# manager. Enabling the timer is a separate, deliberate gem promote step.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_CURSOR_CLI_HOME:-$HOME}"

UNIT_NAMES=("cursor-cli-worker.service" "cursor-cli-worker.timer")
BIN_NAMES=("cursor-agent-std" "cursor-cli-worker")
UNIT_DST_DIR="$TARGET_HOME/.config/systemd/user"
BIN_DST_DIR="$TARGET_HOME/.local/bin"
RECEIPT_DIR="$TARGET_HOME/.local/state/symphony-cursor-cli"
RECEIPT="$RECEIPT_DIR/install-receipt.json"
RECEIPT_SCHEMA="symphony-cursor-cli-install/v1"

CHECK_ONLY=0
DAEMON_RELOAD=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-daemon-reload) DAEMON_RELOAD=0 ;;
    *) echo "usage: $0 [--check] [--no-daemon-reload]" >&2; exit 2 ;;
  esac
done

unit_source() {
  printf '%s/scripts/symphony/systemd/%s' "$REPO_ROOT" "$1"
}

bin_source() {
  case "$1" in
    cursor-agent-std) printf '%s/scripts/symphony/cursor-agent-std' "$REPO_ROOT" ;;
    cursor-cli-worker) printf '%s/scripts/symphony/cursor-cli-worker.py' "$REPO_ROOT" ;;
    *) return 1 ;;
  esac
}

require_sources() {
  local name
  for name in "${UNIT_NAMES[@]}"; do
    if [ ! -f "$(unit_source "$name")" ]; then
      echo "MISSING_SOURCE $(unit_source "$name")" >&2
      exit 2
    fi
  done
  for name in "${BIN_NAMES[@]}"; do
    if [ ! -f "$(bin_source "$name")" ]; then
      echo "MISSING_SOURCE $(bin_source "$name")" >&2
      exit 2
    fi
  done
}

require_exact_main() {
  local head_sha main_sha
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
  if ! git -C "$REPO_ROOT" diff --quiet -- \
      scripts/symphony/systemd/cursor-cli-worker.service \
      scripts/symphony/systemd/cursor-cli-worker.timer \
      scripts/symphony/cursor-agent-std \
      scripts/symphony/cursor-cli-worker.py \
    || ! git -C "$REPO_ROOT" diff --cached --quiet -- \
      scripts/symphony/systemd/cursor-cli-worker.service \
      scripts/symphony/systemd/cursor-cli-worker.timer \
      scripts/symphony/cursor-agent-std \
      scripts/symphony/cursor-cli-worker.py; then
    echo "DIRTY_SOURCES cursor-cli-worker" >&2
    exit 2
  fi
  printf '%s' "$head_sha"
}

write_receipt() {
  local head_sha="$1"
  mkdir -p "$RECEIPT_DIR"
  RECEIPT_PATH="$RECEIPT" RECEIPT_SCHEMA_VALUE="$RECEIPT_SCHEMA" \
  RECEIPT_HEAD="$head_sha" RECEIPT_UNITS="${UNIT_NAMES[*]}" \
  RECEIPT_BINS="${BIN_NAMES[*]}" \
  RECEIPT_DST_DIR="$UNIT_DST_DIR" RECEIPT_BIN_DIR="$BIN_DST_DIR" python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import time

receipt_path = pathlib.Path(os.environ["RECEIPT_PATH"])
files = {}
for name in os.environ["RECEIPT_UNITS"].split():
    data = (pathlib.Path(os.environ["RECEIPT_DST_DIR"]) / name).read_bytes()
    files[name] = hashlib.sha256(data).hexdigest()
for name in os.environ["RECEIPT_BINS"].split():
    data = (pathlib.Path(os.environ["RECEIPT_BIN_DIR"]) / name).read_bytes()
    files[name] = hashlib.sha256(data).hexdigest()
head = os.environ["RECEIPT_HEAD"]
payload = {
    "schema": os.environ["RECEIPT_SCHEMA_VALUE"],
    "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": {"head": head, "originMain": head},
    "gemCursorExecutable": str(pathlib.Path(os.environ["RECEIPT_BIN_DIR"]) / "cursor-agent-std"),
    "files": files,
}
temporary = receipt_path.with_name(f".{receipt_path.name}.tmp")
temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
temporary.replace(receipt_path)
PY
  echo "RECEIPT $RECEIPT"
  echo "GEM_CURSOR_EXECUTABLE $BIN_DST_DIR/cursor-agent-std"
}

check_one() {
  local src="$1" dst="$2"
  if [ ! -f "$dst" ]; then
    echo "MISSING $dst"
    return 1
  fi
  if cmp -s "$src" "$dst"; then
    echo "OK $dst"
    return 0
  fi
  echo "DRIFT $dst"
  return 1
}

check_receipt() {
  if [ ! -f "$RECEIPT" ]; then
    echo "MISSING $RECEIPT"
    return 1
  fi
  RECEIPT_PATH="$RECEIPT" RECEIPT_SCHEMA_VALUE="$RECEIPT_SCHEMA" \
  RECEIPT_UNITS="${UNIT_NAMES[*]}" RECEIPT_BINS="${BIN_NAMES[*]}" \
  RECEIPT_DST_DIR="$UNIT_DST_DIR" RECEIPT_BIN_DIR="$BIN_DST_DIR" python3 - <<'PY'
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
files = payload.get("files") if isinstance(payload, dict) else None
valid = (
    payload.get("schema") == os.environ["RECEIPT_SCHEMA_VALUE"]
    and isinstance(source, dict)
    and isinstance(source.get("head"), str)
    and source.get("head") == source.get("originMain")
    and isinstance(files, dict)
    and payload.get("gemCursorExecutable")
    == str(pathlib.Path(os.environ["RECEIPT_BIN_DIR"]) / "cursor-agent-std")
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
        if files.get(name) != digest:
            valid = False
            break
    for name in os.environ["RECEIPT_BINS"].split():
        try:
            digest = hashlib.sha256(
                (pathlib.Path(os.environ["RECEIPT_BIN_DIR"]) / name).read_bytes()
            ).hexdigest()
        except OSError:
            valid = False
            break
        if files.get(name) != digest:
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
    check_one "$(unit_source "$name")" "$UNIT_DST_DIR/$name" || rc=1
  done
  for name in "${BIN_NAMES[@]}"; do
    check_one "$(bin_source "$name")" "$BIN_DST_DIR/$name" || rc=1
  done
  check_receipt || rc=1
  exit "$rc"
fi

HEAD_SHA="$(require_exact_main)"
mkdir -p "$UNIT_DST_DIR" "$BIN_DST_DIR"

for name in "${UNIT_NAMES[@]}"; do
  src="$(unit_source "$name")"
  dst="$UNIT_DST_DIR/$name"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    backup="$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$dst" "$backup"
    echo "BACKUP $backup"
  fi
  install -m 0644 "$src" "$dst"
  echo "INSTALLED $dst"
done

for name in "${BIN_NAMES[@]}"; do
  src="$(bin_source "$name")"
  dst="$BIN_DST_DIR/$name"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    backup="$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$dst" "$backup"
    echo "BACKUP $backup"
  fi
  install -m 0755 "$src" "$dst"
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
