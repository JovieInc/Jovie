#!/usr/bin/env bash
# Compatibility entrypoint for the source-owned official OpenAI Symphony runtime.
#
# Historical name retained so existing automation has one migration point, but
# this installs symphony-elixir.service on 4041, not the obsolete burrito unit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_ELIXIR_HOME:-${SYMPHONY_BURRITO_HOME:-$HOME}}"
SYMPHONY_VERSION="${SYMPHONY_VERSION:-v0.0.2-jovie.2}"
ASSET_NAME_NEEDLE="${SYMPHONY_ASSET_NEEDLE:-linux_x86_64}"
RELEASE_URL="${SYMPHONY_RELEASE_URL:-https://github.com/JovieInc/symphony/releases/download/${SYMPHONY_VERSION}}"
BIN_NAME="symphony-${SYMPHONY_VERSION}-${ASSET_NAME_NEEDLE}"
SUM_NAME="${BIN_NAME}.sha256"
BIN_DST="${TARGET_HOME}/.local/bin/symphony"
SERVICE_NAME="${SYMPHONY_SERVICE_NAME:-symphony-elixir.service}"
UNIT_SRC="${REPO_ROOT}/scripts/symphony/systemd/symphony-elixir.service"
UNIT_DST="${TARGET_HOME}/.config/systemd/user/${SERVICE_NAME}"
WORKFLOW_SRC="${SYMPHONY_WORKFLOW_SRC:-${REPO_ROOT}/scripts/symphony/WORKFLOW.md}"
WORKFLOW_DST="${TARGET_HOME}/.config/symphony/WORKFLOW.md"
ACCOUNT_ENV="${TARGET_HOME}/.config/symphony/codex-account.env"
LINEAR_ENV="${TARGET_HOME}/.config/symphony/linear.env"
HELPER_SRC="${REPO_ROOT}/scripts/symphony/symphony_official_runtime.py"
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
RETIRE_LEGACY=0
ACTIVE_ISSUES=""
MIN_RESTART_NEXT_POLL_MS="${SYMPHONY_MIN_RESTART_NEXT_POLL_MS:-5000}"
# Genuinely retired units only. The grok/kimi sidecar
# (symphony-grok-sidecar.{service,timer}) is the ACTIVE coding lane while
# Codex seats are exhausted (Tim, 2026-09-03) and is installed/owned by
# scripts/symphony/install-symphony-grok-sidecar.sh — never mask it here.
LEGACY_UNITS=(
  symphony-ui-pilot.service
  symphony-reconciler.service
  symphony-reconciler.timer
  symphony-burrito.service
  symphony-burrito-update.service
  symphony-burrito-update.timer
)

usage() { echo "usage: $0 [--dry-run] [--check] [--no-restart] [--skip-binary] [--retire-legacy] [--runtime-readback]" >&2; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --check) CHECK_ONLY=1 ;;
    --no-restart) RESTART=0 ;;
    --skip-binary) SKIP_BINARY=1 ;;
    --retire-legacy) RETIRE_LEGACY=1 ;;
    --runtime-readback) RUNTIME_READBACK=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

if [ "$RESTART" -eq 1 ]; then
  RETIRE_LEGACY=1
fi

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
  ACTIVE_ISSUES="$(python3 "$HELPER_SRC" linear-eligible-count --linear-env-file "$LINEAR_ENV")"
  case "$ACTIVE_ISSUES" in
    ''|*[!0-9]*)
      echo "SOURCE_INVALID invalid Linear active issue count: ${ACTIVE_ISSUES:-empty}" >&2
      return 4
      ;;
  esac
  echo "ACTIVE_ISSUES $ACTIVE_ISSUES"
  python3 "$HELPER_SRC" validate-source \
    --repo-root "$REPO_ROOT" \
    --workflow "$WORKFLOW_SRC" \
    --unit "$UNIT_SRC" \
    --service-name "$SERVICE_NAME" \
    --active-issues "$ACTIVE_ISSUES"
}

validate_rollback_bundle() {
  python3 "$HELPER_SRC" validate-source \
    --repo-root "$REPO_ROOT" \
    --workflow "$rollback_dir/workflow" \
    --unit "$rollback_dir/unit" \
    --service-name "$SERVICE_NAME" \
    --active-issues "$ACTIVE_ISSUES" >/dev/null &&
  cmp -s "$rollback_dir/helper" "$HELPER_SRC" &&
  python3 - "$rollback_dir" "$STATE_DIR/candidates" <<'PY'
import json, pathlib, sys
rollback = pathlib.Path(sys.argv[1])
candidates = pathlib.Path(sys.argv[2])
saved = json.loads((rollback / "manifest.json").read_text())
required = {name: saved.get(name) for name in ("helper", "unit", "workflow")}
if any(value is None for value in required.values()):
    raise SystemExit(1)
if "binary" in saved:
    required["binary"] = saved["binary"]
for candidate in candidates.iterdir():
    try:
        manifest = json.loads((candidate / "manifest.json").read_text())
        if manifest.get("schema") == "symphony-candidate/v2" and all(
            manifest.get("files", {}).get(name) == digest
            for name, digest in required.items()
        ):
            raise SystemExit(0)
    except (OSError, TypeError, ValueError):
        continue
raise SystemExit(1)
PY
}

install_one() {
  local src="$1" dst="$2" mode="${3:-0644}" temporary
  if [ ! -f "$src" ]; then
    echo "MISSING_SOURCE $src" >&2
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  temporary="${dst}.tmp.$$"
  install -m "$mode" "$src" "$temporary"
  mv "$temporary" "$dst"
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

check_workflow() {
  local src="$1" dst="$2"
  if [ ! -f "$dst" ]; then
    echo "MISSING $dst"
    return 1
  fi
  if python3 - "$src" "$dst" <<'PY'
import pathlib, re, sys

pattern = re.compile(r"^(\s*max_concurrent_agents:\s*)(\d+)(\s*)$", re.MULTILINE)

def normalized(path):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    matches = pattern.findall(text)
    if len(matches) != 1:
        return None
    value = int(matches[0][1])
    if not 1 <= value <= 8:
        return None
    return pattern.sub(r"\g<1>__RUNTIME_OVERLAY__\g<3>", text)

raise SystemExit(0 if normalized(sys.argv[1]) == normalized(sys.argv[2]) else 1)
PY
  then
    echo "OK $dst (bounded max_concurrent_agents overlay accepted)"
  else
    echo "DRIFT $dst"
    return 1
  fi
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
  for legacy in "${LEGACY_UNITS[@]}"; do
    if [ "$(systemctl --user show "$legacy" --property=LoadState --value 2>/dev/null || true)" = masked ]; then
      echo "LEGACY_MASKED $legacy"
    elif systemctl --user is-enabled --quiet "$legacy" 2>/dev/null; then
      echo "LEGACY_ENABLED $legacy"
      rc=1
    else
      echo "LEGACY_NOT_MASKED $legacy"
      rc=1
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

promotion_idle_snapshot() {
  python3 - "$STATE_URL" <<'PY'
import json, sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=5) as response:
        data = json.load(response)
except Exception as exc:
    print(f"state API unavailable: {exc}", file=sys.stderr)
    raise SystemExit(1)
counts = data.get("counts")
running_count = counts.get("running") if isinstance(counts, dict) else None
if not isinstance(running_count, int) or isinstance(running_count, bool) or running_count < 0:
    print("state API response has invalid counts.running", file=sys.stderr)
    raise SystemExit(2)
running = data.get("running")
if isinstance(running, list) and len(running) != running_count:
    print("state API running list disagrees with counts.running", file=sys.stderr)
    raise SystemExit(3)
polling = data.get("polling")
if not isinstance(polling, dict):
    print("state API response is missing polling state", file=sys.stderr)
    raise SystemExit(4)
checking = polling.get("checking?")
if checking is None:
    checking = polling.get("checking")
if not isinstance(checking, bool):
    print("state API response has invalid polling.checking", file=sys.stderr)
    raise SystemExit(4)
next_poll_ms = polling.get("next_poll_in_ms")
if isinstance(next_poll_ms, bool) or not isinstance(next_poll_ms, int) or next_poll_ms < 0:
    print("state API response has invalid polling.next_poll_in_ms", file=sys.stderr)
    raise SystemExit(4)
print(f"{running_count} {1 if checking else 0} {next_poll_ms}")
PY
}

stop_idle_official_for_restart() {
  local snapshot running checking next_poll_ms
  for _ in $(seq 1 45); do
    if ! snapshot="$(promotion_idle_snapshot)"; then
      echo "PROMOTION_RED cannot prove the official runtime is idle" >&2
      return 6
    fi
    read -r running checking next_poll_ms <<< "$snapshot"
    case "$running:$checking:$next_poll_ms" in
      *[!0-9:]*)
        echo "PROMOTION_RED invalid runtime idle snapshot: $snapshot" >&2
        return 6
        ;;
    esac
    if [ "$running" -gt 0 ]; then
      echo "PROMOTION_RED active official agents would be interrupted: $running" >&2
      return 6
    fi
    if [ "$checking" -eq 0 ] && [ "$next_poll_ms" -ge "$MIN_RESTART_NEXT_POLL_MS" ]; then
      if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        if ! systemctl --user stop "$SERVICE_NAME"; then
          echo "PROMOTION_RED failed to stop idle $SERVICE_NAME before file promotion" >&2
          return 6
        fi
        official_stopped_for_promotion=1
        echo "PROMOTION_OK stopped idle $SERVICE_NAME before file promotion; next poll was in ${next_poll_ms}ms on $STATE_URL"
      else
        echo "PROMOTION_OK no active official agents; $SERVICE_NAME is not active before restart promotion"
      fi
      return 0
    fi
    sleep 1
  done
  echo "PROMOTION_RED official runtime did not expose a safe idle restart window" >&2
  return 6
}

assert_account_environment_ready() {
  local account_name configured_home mode
  if [ ! -f "$ACCOUNT_ENV" ]; then
    echo "PROMOTION_RED host-owned Codex account selection is missing: $ACCOUNT_ENV" >&2
    return 8
  fi
  configured_home="$(sed -n 's/^CODEX_HOME=//p' "$ACCOUNT_ENV")"
  account_name="${configured_home#"${TARGET_HOME}/.codex-accounts/"}"
  if [ "$(grep -c '^CODEX_HOME=' "$ACCOUNT_ENV")" -ne 1 ] ||
     [ "$account_name" = "$configured_home" ] ||
     ! [[ "$account_name" =~ ^[A-Za-z0-9._-]+$ ]] ||
     [ ! -d "$configured_home" ]; then
    echo "PROMOTION_RED invalid host-owned Codex account selection: $ACCOUNT_ENV" >&2
    return 8
  fi
  if ! mode="$(stat -c '%a' "$ACCOUNT_ENV" 2>/dev/null)"; then
    mode="$(stat -f '%Lp' "$ACCOUNT_ENV")"
  fi
  if [ $((8#$mode & 022)) -ne 0 ]; then
    echo "PROMOTION_RED Codex account selection must not be group/world writable: $ACCOUNT_ENV" >&2
    return 8
  fi
  echo "ACCOUNT_ENV_OK host-owned selection present"
}

prepare_systemd_context() {
  if [ -z "${XDG_RUNTIME_DIR:-}" ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
    export DBUS_SESSION_BUS_ADDRESS
  fi
  test -S "${XDG_RUNTIME_DIR}/bus"
  systemctl --user show-environment >/dev/null
}

retire_legacy_units() {
  local backup_dir legacy load_state stamp unit_path
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="${STATE_DIR}/legacy-unit-backups/${stamp}"
  mkdir -p "$backup_dir"
  for legacy in "${LEGACY_UNITS[@]}"; do
    systemctl --user disable --now "$legacy" >/dev/null 2>&1 || true
    unit_path="${TARGET_HOME}/.config/systemd/user/${legacy}"
    if [ -e "$unit_path" ] && [ ! -L "$unit_path" ]; then
      cp -p "$unit_path" "${backup_dir}/${legacy}"
      rm -f "$unit_path"
    fi
  done
  systemctl --user daemon-reload
  systemctl --user mask --now "${LEGACY_UNITS[@]}" >/dev/null
  systemctl --user daemon-reload
  for legacy in "${LEGACY_UNITS[@]}"; do
    load_state="$(systemctl --user show "$legacy" --property=LoadState --value)"
    if [ "$load_state" != masked ]; then
      echo "PROMOTION_RED legacy unit is not masked: $legacy load_state=$load_state" >&2
      return 9
    fi
    if systemctl --user is-active --quiet "$legacy"; then
      echo "PROMOTION_RED legacy unit is still active: $legacy" >&2
      return 9
    fi
  done
  echo "LEGACY_MASKED ${LEGACY_UNITS[*]} backup=$backup_dir"
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
  echo "LEGACY_MASKED ${LEGACY_UNITS[*]}"
  exit 0
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  rc=0
  check_workflow "$WORKFLOW_SRC" "$WORKFLOW_DST" || rc=1
  check_one "$UNIT_SRC" "$UNIT_DST" || rc=1
  check_one "$HELPER_SRC" "$HELPER_DST" || rc=1
  exit "$rc"
fi

echo "RELEASE ${SYMPHONY_VERSION}"
echo "ASSET ${BIN_NAME}"
echo "SHA256 ${SUM_NAME}"

tmpdir=""
rollback_dir=""
candidate_dir=""
candidate_tmp=""
update_lock=""
promotion_started=0
promotion_complete=0
official_was_active=0
official_stopped_for_promotion=0
official_pid_before=""
files_promoted=0
rollback_safe=1
rollback_restart_verified=1

write_promotion_hold() {
  local reason="${1:-prior_config_unsafe}"
  CANDIDATE_DIR="$candidate_dir" ROLLBACK_DIR="$rollback_dir" PROMOTION_HOLD_REASON="$reason" python3 - "$STATE_DIR" <<'PY'
import json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
target = root / "promotion-held.json"
temporary = root / ".promotion-held.tmp"
value = {
    "schema": "symphony-promotion-hold/v1",
    "status": "held",
    "reason": os.environ["PROMOTION_HOLD_REASON"],
    "candidate": os.environ["CANDIDATE_DIR"],
    "transaction": os.environ["ROLLBACK_DIR"],
}
temporary.write_text(json.dumps(value, sort_keys=True) + "\n")
with temporary.open("rb") as handle:
    os.fsync(handle.fileno())
os.replace(temporary, target)
descriptor = os.open(root, os.O_RDONLY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
}

backup_target() {
  local key="$1" target="$2"
  if [ -e "$target" ] || [ -L "$target" ]; then
    cp -p "$target" "${rollback_dir}/${key}"
  else
    : > "${rollback_dir}/${key}.missing"
  fi
}

restore_target() {
  local key="$1" target="$2" mode="$3"
  if [ -f "${rollback_dir}/${key}" ]; then
    install_one "${rollback_dir}/${key}" "$target" "$mode" >/dev/null
  elif [ -f "${rollback_dir}/${key}.missing" ]; then
    rm -f "$target"
  fi
}

cleanup() {
  local status="$?"
  if [ "$status" -ne 0 ] && [ "$promotion_complete" -eq 0 ]; then
    if [ "$promotion_started" -eq 1 ]; then
      if [ "$files_promoted" -eq 1 ] && [ "$rollback_safe" -eq 0 ]; then
        write_promotion_hold
      else
        restore_target binary "$BIN_DST" 0755
        restore_target helper "$HELPER_DST" 0755
        restore_target unit "$UNIT_DST" 0644
        restore_target workflow "$WORKFLOW_DST" 0644
      fi
    fi
    if [ "$RESTART" -eq 1 ] || [ "$RETIRE_LEGACY" -eq 1 ] || [ "$official_stopped_for_promotion" -eq 1 ]; then
      if ! systemctl --user daemon-reload >/dev/null 2>&1; then
        rollback_restart_verified=0
      fi
      if [ "$official_stopped_for_promotion" -eq 1 ] && [ "$rollback_safe" -eq 1 ]; then
        if ! systemctl --user restart "$SERVICE_NAME" >/dev/null 2>&1; then
          rollback_restart_verified=0
        fi
      fi
      if [ "$rollback_restart_verified" -eq 0 ] && [ "$promotion_started" -eq 1 ]; then
        write_promotion_hold rollback_restart_failed
      fi
    fi
    if [ "$files_promoted" -eq 1 ] && [ "$rollback_safe" -eq 0 ]; then
      echo "PROMOTION_HELD candidate files retained offline; unsafe prior config not restored" >&2
    elif [ "$promotion_started" -eq 1 ] && [ "$rollback_restart_verified" -eq 0 ]; then
      echo "PROMOTION_HELD official files restored but service restart is unverified" >&2
    elif [ "$promotion_started" -eq 1 ]; then
      echo "PROMOTION_ROLLED_BACK official files restored; legacy units remain fail-closed" >&2
    elif [ "$official_stopped_for_promotion" -eq 1 ]; then
      echo "PROMOTION_ROLLED_BACK official service restarted before file promotion" >&2
    fi
  fi
  [ -z "$tmpdir" ] || rm -rf "$tmpdir"
  if [ "$promotion_complete" -eq 1 ] || { [ "$status" -ne 0 ] && [ "$promotion_started" -eq 1 ] && [ "$rollback_safe" -eq 1 ] && [ "$rollback_restart_verified" -eq 1 ]; }; then
    [ -z "$rollback_dir" ] || rm -rf "$rollback_dir"
  fi
  if [ -n "$candidate_tmp" ]; then
    chmod -R u+w "$candidate_tmp" >/dev/null 2>&1 || true
    rm -rf "$candidate_tmp"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$STATE_DIR"
update_lock="$STATE_DIR/update.lock"
exec 9>"$update_lock"
if ! python3 - 9 <<'PY'
import fcntl, sys
fcntl.flock(int(sys.argv[1]), fcntl.LOCK_EX | fcntl.LOCK_NB)
PY
then
  echo "PROMOTION_RED updater lock is held: $update_lock" >&2
  exit 8
fi

rollback_dir="$STATE_DIR/promotion-transaction"
if [ -d "$rollback_dir" ]; then
  if [ ! -f "$rollback_dir/READY" ] || ! python3 - "$rollback_dir" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
actual = {path.name for path in root.iterdir() if path.is_file()} - {"manifest.json", "READY"}
if set(manifest) != actual or (root / "READY").read_text() != "symphony-promotion-transaction/v1\n":
    raise SystemExit(1)
for name, expected in manifest.items():
    path = root / name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(1)
PY
  then
    echo "PROMOTION_RED incomplete rollback transaction requires operator review" >&2
    exit 9
  fi
  if ! validate_rollback_bundle; then
    echo "PROMOTION_RED rollback transaction is not a validated known-good bundle" >&2
    exit 9
  fi
  promotion_started=1
  restore_target binary "$BIN_DST" 0755
  restore_target helper "$HELPER_DST" 0755
  restore_target unit "$UNIT_DST" 0644
  restore_target workflow "$WORKFLOW_DST" 0644
  prepare_systemd_context
  systemctl --user daemon-reload
  if [ -f "$rollback_dir/was-active" ]; then
    official_stopped_for_promotion=1
    systemctl --user restart "$SERVICE_NAME"
    official_stopped_for_promotion=0
  fi
  rm -rf "$rollback_dir"
  rollback_dir=""
  promotion_started=0
  echo "RECOVERED_INCOMPLETE_PROMOTION"
fi

if [ "$SKIP_BINARY" -eq 0 ]; then
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/symphony-elixir.XXXXXX")"
  download "$BIN_URL" "${tmpdir}/${BIN_NAME}"
  download "$SUM_URL" "${tmpdir}/${SUM_NAME}"
  DIGEST="$(verify_sha256 "${tmpdir}/${BIN_NAME}" "${tmpdir}/${SUM_NAME}")"
  echo "VERIFIED $DIGEST"
else
  echo "SKIP_BINARY"
fi

assert_account_environment_ready
mkdir -p "$STATE_DIR/candidates"
candidate_inputs=("$HELPER_SRC" "$UNIT_SRC" "$WORKFLOW_SRC")
if [ "$SKIP_BINARY" -eq 0 ]; then
  candidate_inputs+=("${tmpdir}/${BIN_NAME}")
fi
candidate_id="$(CANDIDATE_VERSION="$SYMPHONY_VERSION" python3 - "${candidate_inputs[@]}" <<'PY'
import hashlib, os, pathlib, sys
digest = hashlib.sha256()
digest.update(b"symphony-candidate/v2\0")
digest.update(os.environ["CANDIDATE_VERSION"].encode())
for raw in sys.argv[1:]:
    digest.update(pathlib.Path(raw).read_bytes())
print(digest.hexdigest())
PY
)"
candidate_dir="$STATE_DIR/candidates/$candidate_id"
if [ ! -d "$candidate_dir" ]; then
  candidate_tmp="$(mktemp -d "$STATE_DIR/candidates/.candidate.XXXXXX")"
  install_one "$HELPER_SRC" "$candidate_tmp/helper" 0755
  install_one "$UNIT_SRC" "$candidate_tmp/unit" 0644
  install_one "$WORKFLOW_SRC" "$candidate_tmp/workflow" 0644
  if [ "$SKIP_BINARY" -eq 0 ]; then
    install_one "${tmpdir}/${BIN_NAME}" "$candidate_tmp/binary" 0755
  fi
  CANDIDATE_VERSION="$SYMPHONY_VERSION" python3 - "$candidate_tmp" <<'PY'
import hashlib, json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = {}
for path in sorted(root.iterdir()):
    if path.is_file():
        files[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open("rb") as handle:
            os.fsync(handle.fileno())
manifest = {
    "schema": "symphony-candidate/v2",
    "version": os.environ["CANDIDATE_VERSION"],
    "files": files,
}
(root / "manifest.json").write_text(json.dumps(manifest, sort_keys=True) + "\n")
with (root / "manifest.json").open("rb") as handle:
    os.fsync(handle.fileno())
descriptor = os.open(root, os.O_RDONLY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
  chmod 0555 "$candidate_tmp/helper"
  chmod 0444 "$candidate_tmp/unit" "$candidate_tmp/workflow" "$candidate_tmp/manifest.json"
  if [ "$SKIP_BINARY" -eq 0 ]; then chmod 0555 "$candidate_tmp/binary"; fi
  mv "$candidate_tmp" "$candidate_dir"
  chmod 0555 "$candidate_dir"
  candidate_tmp=""
else
  cmp -s "$HELPER_SRC" "$candidate_dir/helper"
  cmp -s "$UNIT_SRC" "$candidate_dir/unit"
  cmp -s "$WORKFLOW_SRC" "$candidate_dir/workflow"
  if [ "$SKIP_BINARY" -eq 0 ]; then
    cmp -s "${tmpdir}/${BIN_NAME}" "$candidate_dir/binary"
  fi
fi
echo "STAGED $candidate_dir"
python3 - "$candidate_dir" "$SYMPHONY_VERSION" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
if manifest.get("schema") != "symphony-candidate/v2" or manifest.get("version") != sys.argv[2]:
    raise SystemExit("candidate manifest identity mismatch")
files = manifest.get("files")
if not isinstance(files, dict):
    raise SystemExit("candidate manifest files missing")
for name, expected in files.items():
    path = root / name
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"candidate file invalid: {name}")
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"candidate hash mismatch: {name}")
PY

if [ "$RESTART" -eq 0 ] && [ "$RETIRE_LEGACY" -eq 0 ]; then
  promotion_complete=1
  echo "DONE_STAGED_NO_LIVE_MUTATION"
  exit 0
fi

if [ "$RESTART" -eq 1 ] || [ "$RETIRE_LEGACY" -eq 1 ]; then
  prepare_systemd_context
  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    official_was_active=1
    official_pid_before="$(systemctl --user show "$SERVICE_NAME" --property=MainPID --value)"
  fi
fi

rollback_tmp="$(mktemp -d "$STATE_DIR/.promotion-transaction.XXXXXX")"
rollback_dir="$rollback_tmp"
backup_target binary "$BIN_DST"
backup_target helper "$HELPER_DST"
backup_target unit "$UNIT_DST"
backup_target workflow "$WORKFLOW_DST"
[ "$official_was_active" -eq 0 ] || : > "$rollback_dir/was-active"
python3 - "$rollback_dir" <<'PY'
import hashlib, json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = {}
for path in sorted(root.iterdir()):
    if path.is_file():
        manifest[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open("rb") as handle:
            os.fsync(handle.fileno())
manifest_path = root / "manifest.json"
manifest_path.write_text(json.dumps(manifest, sort_keys=True) + "\n")
with manifest_path.open("rb") as handle:
    os.fsync(handle.fileno())
(root / "READY").write_text("symphony-promotion-transaction/v1\n")
with (root / "READY").open("rb") as handle:
    os.fsync(handle.fileno())
descriptor = os.open(root, os.O_RDONLY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
mv "$rollback_tmp" "$STATE_DIR/promotion-transaction"
python3 - "$STATE_DIR" <<'PY'
import os, sys
descriptor = os.open(sys.argv[1], os.O_RDONLY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
rollback_dir="$STATE_DIR/promotion-transaction"
promotion_started=1
if ! validate_rollback_bundle; then
  rollback_safe=0
fi

if [ "$RESTART" -eq 1 ]; then
  stop_idle_official_for_restart
fi
if [ "$RESTART" -eq 0 ] && [ "$RETIRE_LEGACY" -eq 1 ] && [ "$official_was_active" -ne 1 ]; then
  echo "PROMOTION_RED --no-restart retirement requires an already-active $SERVICE_NAME" >&2
  exit 7
fi

mkdir -p "$(dirname "$BIN_DST")" "$(dirname "$UNIT_DST")" "$(dirname "$WORKFLOW_DST")" "$LOG_DIR" "$STATE_DIR"

if [ "$SKIP_BINARY" -eq 0 ]; then
  files_promoted=1
  install_one "$candidate_dir/binary" "$BIN_DST" 0755
else
  files_promoted=1
fi
install_one "$candidate_dir/helper" "$HELPER_DST" 0755
install_one "$candidate_dir/unit" "$UNIT_DST"
install_one "$candidate_dir/workflow" "$WORKFLOW_DST"

if [ "$RETIRE_LEGACY" -eq 1 ]; then
  retire_legacy_units
fi

if [ "$RESTART" -eq 1 ] || [ "$RETIRE_LEGACY" -eq 1 ]; then
  systemctl --user daemon-reload
fi
if [ "$RESTART" -eq 1 ]; then
  systemctl --user enable "$SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
  for _ in $(seq 1 45); do
    if systemctl --user is-active --quiet "$SERVICE_NAME" && curl -fsS --max-time 3 "$STATE_URL" >/dev/null; then
      break
    fi
    sleep 2
  done
  systemctl --user is-active --quiet "$SERVICE_NAME"
  curl -fsS --max-time 5 "$STATE_URL" >/dev/null
  echo "RESTARTED $SERVICE_NAME"
elif [ "$RETIRE_LEGACY" -eq 1 ]; then
  systemctl --user is-active --quiet "$SERVICE_NAME"
  curl -fsS --max-time 5 "$STATE_URL" >/dev/null
  after_pid="$(systemctl --user show "$SERVICE_NAME" --property=MainPID --value)"
  test "$official_pid_before" = "$after_pid"
  echo "HOT_RELOAD_OK $SERVICE_NAME pid=$after_pid"
fi

promotion_complete=1
echo "DONE"
