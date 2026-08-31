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
WORKFLOW_SRC="${REPO_ROOT}/WORKFLOW.md"
WORKFLOW_DST="${TARGET_HOME}/.config/symphony/WORKFLOW.md"
LOG_DIR="${TARGET_HOME}/symphony-burrito-logs"
RESTART=1
DRY_RUN=0

usage() {
  echo "usage: $0 [--dry-run] [--no-restart]" >&2
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-restart) RESTART=0 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

json_get() {
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get(sys.argv[1],""))' "$1"
}

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
if [ -f "$WORKFLOW_DST" ] && grep -qE 'git@|mix ' "$WORKFLOW_DST"; then
  echo "PATCH_HOOK replacing SSH/mix after_create with HTTPS WORKFLOW"
fi
install -m 0644 "$WORKFLOW_SRC" "$WORKFLOW_DST"
echo "INSTALLED $BIN_DST"
echo "INSTALLED $UNIT_DST"
echo "INSTALLED $WORKFLOW_DST"

if [ "$RESTART" -eq 1 ]; then
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  systemctl --user daemon-reload
  systemctl --user enable symphony-burrito.service symphony-burrito-update.timer
  systemctl --user restart symphony-burrito.service
  systemctl --user start symphony-burrito-update.timer
  echo "RESTARTED symphony-burrito.service"
fi

echo "DONE"
