#!/usr/bin/env bash
# Download latest openai/symphony linux_x86_64 burrito, sha256-check, install, restart.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_BURRITO_HOME:-$HOME}"
RELEASE_API="${SYMPHONY_RELEASE_API:-https://api.github.com/repos/openai/symphony/releases/latest}"
ASSET_NAME_NEEDLE="${SYMPHONY_ASSET_NEEDLE:-linux_x86_64}"
BIN_DST="${TARGET_HOME}/.local/bin/symphony"
UNIT_SRC="${REPO_ROOT}/scripts/hermes/systemd/symphony-burrito.service"
UNIT_DST="${TARGET_HOME}/.config/systemd/user/symphony-burrito.service"
TIMER_SRC="${REPO_ROOT}/scripts/hermes/systemd/symphony-burrito-update.timer"
TIMER_DST="${TARGET_HOME}/.config/systemd/user/symphony-burrito-update.timer"
UPDATE_UNIT_SRC="${REPO_ROOT}/scripts/hermes/systemd/symphony-burrito-update.service"
UPDATE_UNIT_DST="${TARGET_HOME}/.config/systemd/user/symphony-burrito-update.service"
WORKFLOW_SRC="${SYMPHONY_WORKFLOW_SRC:-${REPO_ROOT}/scripts/hermes/symphony/WORKFLOW.md}"
WORKFLOW_DST="${TARGET_HOME}/.config/symphony/WORKFLOW.md"
LOG_DIR="${TARGET_HOME}/symphony-burrito-logs"
RUNTIME_STATE_URL="${SYMPHONY_BURRITO_STATE_URL:-http://127.0.0.1:4043/api/v1/state}"
RESTART=1
DRY_RUN=0
SKIP_BINARY=0

usage() { echo "usage: $0 [--dry-run] [--no-restart] [--skip-binary]" >&2; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-restart) RESTART=0 ;;
    --skip-binary) SKIP_BINARY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

pick_asset() {
  python3 - "$ASSET_NAME_NEEDLE" <<'PY'
import json, sys
needle = sys.argv[1]
payload = json.load(sys.stdin)
assets = payload.get("assets") or []
binary = checksum = None
for asset in assets:
    name = str(asset.get("name") or "")
    url = asset.get("browser_download_url") or ""
    if not name or not url:
        continue
    if name.endswith(".sha256") and needle in name:
        checksum = {"name": name, "url": url}
    elif needle in name and not name.endswith(".sha256"):
        binary = {"name": name, "url": url}
if not binary or not checksum:
    raise SystemExit("missing linux_x86_64 burrito asset or sha256 sidecar")
print(binary["name"])
print(binary["url"])
print(checksum["name"])
print(checksum["url"])
print(payload.get("tag_name") or "")
PY
}

fetch_json() {
  curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: jovie-symphony-burrito-updater" "$1"
}

download() {
  local url="$1" dest="$2"
  curl -fsSL -H "User-Agent: jovie-symphony-burrito-updater" -o "$dest" "$url"
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

maybe_copy_workflow() {
  mkdir -p "$(dirname "$WORKFLOW_DST")"
  if python3 - "$WORKFLOW_SRC" <<'PY'
import pathlib, sys
t = pathlib.Path(sys.argv[1]).read_text()
h = t.split("after_create:", 1)[-1].split("agent:", 1)[0]
raise SystemExit(0 if ('project_slug: "symphony-ui-pilot-96d6b9c5b2d5"' in t and "git clone --depth 1 https://github.com/JovieInc/Jovie.git ." in t and "symphony-elixir-workspaces" in t and "git@" not in h and "max_concurrent_agents: 3" in t and "symphony-codex-router app-server" in t and "gh CLI" in t and "create_branch" in t and "76869538009648d5b282a4bb21c3d157" in t and "jovie-ba6736cbfbb9" not in t and "timeout_ms: 900000" in t and "before_remove:" in t and "symphony-nvme-package-cache.sh after-create" in t and "pnpm install --offline --frozen-lockfile --ignore-scripts" in t) else 1)
PY
  then install -m 0644 "$WORKFLOW_SRC" "$WORKFLOW_DST" && echo "INSTALLED $WORKFLOW_DST"
  else echo "CONFIG_COPY_RED repo WORKFLOW does not match live slug+HTTPS+git/gh; leaving $WORKFLOW_DST untouched"
  fi
}

assert_restart_safe() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return
  fi
  if ! systemctl --user is-active --quiet symphony-burrito.service; then
    return
  fi
  local payload
  if ! payload="$(curl --fail --silent --show-error --max-time 5 "$RUNTIME_STATE_URL")"; then
    echo "RESTART_REFUSED_STATE_UNREADABLE $RUNTIME_STATE_URL" >&2
    exit 75
  fi
  local status=0
  local active
  active="$(printf '%s' "$payload" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
running = payload.get("running")
if not isinstance(running, list):
    raise SystemExit(2)
if running:
    for item in running[:5]:
        print(item.get("issue_identifier") or item.get("identifier") or item.get("id") or "unknown")
    raise SystemExit(1)
' 2>&1)" || status=$?
  if [ "$status" -eq 1 ]; then
    [ -z "$active" ] || printf '%s\n' "$active" >&2
    echo "RESTART_REFUSED_ACTIVE_LEASES symphony-burrito.service" >&2
    exit 75
  fi
  if [ "$status" -ne 0 ]; then
    echo "RESTART_REFUSED_STATE_MALFORMED $RUNTIME_STATE_URL" >&2
    exit 75
  fi
}

restart_service() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "RESTART_REFUSED_SYSTEMCTL_MISSING" >&2
    exit 75
  fi
  assert_restart_safe
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  systemctl --user daemon-reload
  systemctl --user enable symphony-burrito.service symphony-burrito-update.timer
  systemctl --user restart symphony-burrito.service
  systemctl --user start symphony-burrito-update.timer
  echo "RESTARTED symphony-burrito.service"
}

if [ "$SKIP_BINARY" -eq 1 ]; then
  echo "SKIP_BINARY"
  maybe_copy_workflow
  if [ "$RESTART" -eq 1 ]; then
    restart_service
  fi
  echo "DONE"
  exit 0
fi

release_json="$(fetch_json "$RELEASE_API")"
mapfile -t ASSET_META < <(printf '%s' "$release_json" | pick_asset)
BIN_NAME="${ASSET_META[0]}"
BIN_URL="${ASSET_META[1]}"
SUM_NAME="${ASSET_META[2]}"
SUM_URL="${ASSET_META[3]}"
TAG="${ASSET_META[4]}"

echo "RELEASE ${TAG}"
echo "ASSET ${BIN_NAME}"
echo "SHA256 ${SUM_NAME}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY_RUN $BIN_URL"
  echo "DRY_RUN $SUM_URL"
  echo "INSTALL $BIN_DST"
  echo "UNIT $UNIT_DST"
  echo "WORKFLOW $WORKFLOW_DST"
  exit 0
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/symphony-burrito.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

download "$BIN_URL" "${tmpdir}/${BIN_NAME}"
download "$SUM_URL" "${tmpdir}/${SUM_NAME}"
DIGEST="$(verify_sha256 "${tmpdir}/${BIN_NAME}" "${tmpdir}/${SUM_NAME}")"
echo "VERIFIED $DIGEST"

mkdir -p "$(dirname "$BIN_DST")" "$(dirname "$UNIT_DST")" "$(dirname "$WORKFLOW_DST")" "$LOG_DIR"
install -m 0755 "${tmpdir}/${BIN_NAME}" "$BIN_DST"
install -m 0644 "$UNIT_SRC" "$UNIT_DST"
install -m 0644 "$TIMER_SRC" "$TIMER_DST"
install -m 0644 "$UPDATE_UNIT_SRC" "$UPDATE_UNIT_DST"
echo "INSTALLED $BIN_DST"
echo "INSTALLED $UNIT_DST"
maybe_copy_workflow

if [ "$RESTART" -eq 1 ]; then
  restart_service
fi

echo "DONE"
