#!/usr/bin/env bash
# Compatibility entrypoint for the source-owned official OpenAI Symphony runtime.
#
# Historical name retained so existing automation has one migration point, but
# this installs symphony-elixir.service on 4041, not the obsolete burrito unit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_ELIXIR_HOME:-${SYMPHONY_BURRITO_HOME:-$HOME}}"
SYMPHONY_VERSION="${SYMPHONY_VERSION:-v0.0.2}"
ASSET_NAME_NEEDLE="${SYMPHONY_ASSET_NEEDLE:-linux_x86_64}"
RELEASE_URL="${SYMPHONY_RELEASE_URL:-https://github.com/openai/symphony/releases/download/${SYMPHONY_VERSION}}"
BIN_NAME="symphony-${SYMPHONY_VERSION}-${ASSET_NAME_NEEDLE}"
SUM_NAME="${BIN_NAME}.sha256"
BIN_DST="${TARGET_HOME}/.local/bin/symphony"
SERVICE_NAME="${SYMPHONY_SERVICE_NAME:-symphony-elixir.service}"
UNIT_SRC="${REPO_ROOT}/scripts/hermes/systemd/symphony-elixir.service"
UNIT_DST="${TARGET_HOME}/.config/systemd/user/${SERVICE_NAME}"
WORKFLOW_SRC="${SYMPHONY_WORKFLOW_SRC:-${REPO_ROOT}/scripts/hermes/symphony/WORKFLOW.md}"
WORKFLOW_DST="${TARGET_HOME}/.config/symphony/WORKFLOW.md"
HELPER_SRC="${REPO_ROOT}/scripts/hermes/symphony_official_runtime.py"
HELPER_DST="${TARGET_HOME}/.local/bin/symphony-official-runtime"
LOG_DIR="${TARGET_HOME}/symphony-elixir-logs"
STATE_DIR="${TARGET_HOME}/.local/state/symphony-elixir"
STATE_URL="${SYMPHONY_STATE_URL:-http://127.0.0.1:4041/api/v1/state}"
LYB_STATE_URL="${SYMPHONY_LYB_STATE_URL:-http://127.0.0.1:4042/api/v1/state}"
RESTART=1
DRY_RUN=0
SKIP_BINARY=0
CHECK_ONLY=0
RUNTIME_READBACK=0

usage() { echo "usage: $0 [--dry-run] [--check] [--no-restart] [--skip-binary] [--runtime-readback]" >&2; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --check) CHECK_ONLY=1 ;;
    --no-restart) RESTART=0 ;;
    --skip-binary) SKIP_BINARY=1 ;;
    --runtime-readback) RUNTIME_READBACK=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

download() {
  local url="$1" dest="$2"
  curl -fsSL -H "User-Agent: jovie-symphony-elixir-updater" -o "$dest" "$url"
}

verify_sha256() {
  python3 - "$1" "$2" <<'PY'
import hashlib, pathlib, sys
binary = pathlib.Path(sys.argv[1])
sidecar = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
expected = sidecar.split()[0].strip().lower()
if len(expected) != 64 or any(ch not in "0123456789abcdef" for ch in expected):
    raise SystemExit("invalid sha256 sidecar")
digest = hashlib.sha256(binary.read_bytes()).hexdigest()
if digest != expected:
    raise SystemExit(f"sha256 mismatch: got {digest} want {expected}")
print(digest)
PY
}

validate_source() {
  python3 "$HELPER_SRC" validate-source \
    --repo-root "$REPO_ROOT" \
    --workflow "$WORKFLOW_SRC" \
    --unit "$UNIT_SRC" \
    --service-name "$SERVICE_NAME"
}

install_one() {
  local src="$1" dst="$2" mode="${3:-0644}"
  if [ ! -f "$src" ]; then
    echo "MISSING_SOURCE $src" >&2
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
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

runtime_readback() {
  local rc=0
  echo "SERVICE $SERVICE_NAME"
  if systemctl --user is-active --quiet "$SERVICE_NAME"; then
    echo "STATE active"
  else
    echo "STATE inactive-or-unavailable"
    rc=1
  fi
  local pid
  pid="$(systemctl --user show "$SERVICE_NAME" --property=MainPID --value 2>/dev/null || true)"
  echo "PID ${pid:-unknown}"
  if curl -fsS --max-time 5 "$STATE_URL" >/dev/null; then
    echo "API_OK $STATE_URL"
  else
    echo "API_RED $STATE_URL"
    rc=1
  fi
  if systemctl --user is-active --quiet symphony-lyb.service; then
    echo "LYB_ACTIVE symphony-lyb.service 127.0.0.1:4042"
  else
    echo "LYB_RED symphony-lyb.service 127.0.0.1:4042"
    rc=1
  fi
  if curl -fsS --max-time 5 "$LYB_STATE_URL" >/dev/null; then
    echo "LYB_API_OK $LYB_STATE_URL"
  else
    echo "LYB_API_RED $LYB_STATE_URL"
    rc=1
  fi
  for legacy in symphony-ui-pilot.service symphony-burrito.service symphony-burrito-update.timer symphony-burrito-update.service; do
    if systemctl --user is-enabled --quiet "$legacy" 2>/dev/null; then
      echo "LEGACY_ENABLED $legacy"
      rc=1
    else
      echo "LEGACY_DISABLED $legacy"
    fi
  done
  echo "SOURCE_HASH workflow=$(python3 - "$WORKFLOW_SRC" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"
  echo "SOURCE_HASH unit=$(python3 - "$UNIT_SRC" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"
  return "$rc"
}

running_agent_count() {
  python3 - "$STATE_URL" <<'PY' || true
import json, sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=5) as response:
        data = json.load(response)
except Exception:
    print(0)
    raise SystemExit(0)
running = data.get("running")
print(len(running) if isinstance(running, list) else 0)
PY
}

assert_no_active_agents_interrupted() {
  local running
  running="$(running_agent_count)"
  if [ "${running:-0}" -gt 0 ]; then
    echo "PROMOTION_RED active official agents would be interrupted: $running" >&2
    return 6
  fi
  echo "PROMOTION_OK no active official agents reported on $STATE_URL"
}

prepare_systemd_context() {
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
}

disable_legacy_runtime_now() {
  systemctl --user disable --now \
    symphony-ui-pilot.service \
    symphony-burrito.service \
    symphony-burrito-update.timer \
    symphony-burrito-update.service >/dev/null 2>&1 || true
  echo "LEGACY_DISABLED symphony-ui-pilot.service symphony-burrito.service symphony-burrito-update.timer symphony-burrito-update.service"
}

if [ "$RUNTIME_READBACK" -eq 1 ]; then
  runtime_readback
  exit "$?"
fi

if ! validate_source; then
  echo "SOURCE_INVALID refusing obsolete or over-budget Symphony config" >&2
  exit 4
fi

BIN_URL="${RELEASE_URL}/${BIN_NAME}"
SUM_URL="${RELEASE_URL}/${SUM_NAME}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY_RUN official OpenAI Symphony"
  echo "RELEASE ${SYMPHONY_VERSION}"
  echo "ASSET ${BIN_NAME}"
  echo "SHA256 ${SUM_NAME}"
  echo "DRY_RUN $BIN_URL"
  echo "DRY_RUN $SUM_URL"
  echo "INSTALL $BIN_DST"
  echo "HELPER $HELPER_DST"
  echo "UNIT $UNIT_DST"
  echo "WORKFLOW $WORKFLOW_DST"
  echo "SERVICE $SERVICE_NAME"
  echo "PORT 4041"
  echo "UNTOUCHED symphony-lyb.service $LYB_STATE_URL"
  echo "LEGACY_DISABLE_NOW symphony-ui-pilot.service symphony-burrito.service symphony-burrito-update.timer symphony-burrito-update.service"
  exit 0
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  rc=0
  check_one "$WORKFLOW_SRC" "$WORKFLOW_DST" || rc=1
  check_one "$UNIT_SRC" "$UNIT_DST" || rc=1
  check_one "$HELPER_SRC" "$HELPER_DST" || rc=1
  exit "$rc"
fi

if [ "$SKIP_BINARY" -eq 1 ]; then
  echo "SKIP_BINARY"
  install_one "$HELPER_SRC" "$HELPER_DST" 0755
  install_one "$UNIT_SRC" "$UNIT_DST"
  install_one "$WORKFLOW_SRC" "$WORKFLOW_DST"
  echo "DONE"
  exit 0
fi

echo "RELEASE ${SYMPHONY_VERSION}"
echo "ASSET ${BIN_NAME}"
echo "SHA256 ${SUM_NAME}"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/symphony-elixir.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

download "$BIN_URL" "${tmpdir}/${BIN_NAME}"
download "$SUM_URL" "${tmpdir}/${SUM_NAME}"
DIGEST="$(verify_sha256 "${tmpdir}/${BIN_NAME}" "${tmpdir}/${SUM_NAME}")"
echo "VERIFIED $DIGEST"

if [ "$RESTART" -eq 1 ]; then
  prepare_systemd_context
  assert_no_active_agents_interrupted
  disable_legacy_runtime_now
fi

mkdir -p "$(dirname "$BIN_DST")" "$(dirname "$UNIT_DST")" "$(dirname "$WORKFLOW_DST")" "$LOG_DIR" "$STATE_DIR"
install -m 0755 "${tmpdir}/${BIN_NAME}" "$BIN_DST"
echo "INSTALLED $BIN_DST"
install_one "$HELPER_SRC" "$HELPER_DST" 0755
install_one "$UNIT_SRC" "$UNIT_DST"
install_one "$WORKFLOW_SRC" "$WORKFLOW_DST"

if [ "$RESTART" -eq 1 ]; then
  systemctl --user daemon-reload
  systemctl --user enable "$SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
  echo "RESTARTED $SERVICE_NAME"
  runtime_readback
fi

echo "DONE"
