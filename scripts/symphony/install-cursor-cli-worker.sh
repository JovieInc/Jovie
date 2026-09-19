#!/usr/bin/env bash
# gem (Ubuntu Symphony) only. Exact origin/main. Never starts units. Never say "the Mac."
# Pro=Tim's MacBook Pro (mac.lan / M5 32GB — where Ops/Grok Bot local tools run);
# Air=MacBook Air powered off on desk; PC=dead.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_CURSOR_CLI_HOME:-$HOME}"
UNITS=(cursor-cli-worker.service cursor-cli-worker.timer)
BINS=(cursor-agent-std cursor-cli-worker)
UNIT_DST="$TARGET_HOME/.config/systemd/user"
BIN_DST="$TARGET_HOME/.local/bin"
RECEIPT="$TARGET_HOME/.local/state/symphony-cursor-cli/install-receipt.json"
CHECK_ONLY=0
DAEMON_RELOAD=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-daemon-reload) DAEMON_RELOAD=0 ;;
    *) echo "usage: $0 [--check] [--no-daemon-reload]" >&2; exit 2 ;;
  esac
done
src_unit() { printf '%s/scripts/symphony/systemd/%s' "$REPO_ROOT" "$1"; }
src_bin() { [ "$1" = cursor-agent-std ] && printf '%s/scripts/symphony/cursor-agent-std' "$REPO_ROOT" || printf '%s/scripts/symphony/cursor-cli-worker.py' "$REPO_ROOT"; }
for name in "${UNITS[@]}"; do [ -f "$(src_unit "$name")" ] || { echo "MISSING_SOURCE $(src_unit "$name")" >&2; exit 2; }; done
for name in "${BINS[@]}"; do [ -f "$(src_bin "$name")" ] || { echo "MISSING_SOURCE $(src_bin "$name")" >&2; exit 2; }; done
receipt() {
  RECEIPT_PATH="$RECEIPT" MODE="$1" HEAD="${2:-}" UNIT_DST="$UNIT_DST" BIN_DST="$BIN_DST" UNITS="${UNITS[*]}" BINS="${BINS[*]}" python3 -c '
import hashlib,json,os,pathlib,sys,time
units,bins=os.environ["UNITS"].split(),os.environ["BINS"].split()
ud,bd=pathlib.Path(os.environ["UNIT_DST"]),pathlib.Path(os.environ["BIN_DST"])
files={n:hashlib.sha256((ud/n).read_bytes()).hexdigest() for n in units}
files.update({n:hashlib.sha256((bd/n).read_bytes()).hexdigest() for n in bins})
path=pathlib.Path(os.environ["RECEIPT_PATH"]); expected=str(bd/"cursor-agent-std")
if os.environ["MODE"]=="write":
    head=os.environ["HEAD"]; tmp=path.with_name("."+path.name+".tmp")
    tmp.write_text(json.dumps({"schema":"symphony-cursor-cli-install/v1","installedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"source":{"head":head,"originMain":head},"gemCursorExecutable":expected,"files":files},indent=2,sort_keys=True)+"\n"); tmp.replace(path)
    print("RECEIPT",path); print("GEM_CURSOR_EXECUTABLE",expected); raise SystemExit(0)
try: payload=json.loads(path.read_text())
except Exception: print("RECEIPT_INVALID",file=sys.stderr); raise SystemExit(1)
src=payload.get("source") if isinstance(payload,dict) else None; stored=payload.get("files") if isinstance(payload,dict) else None
ok=payload.get("schema")=="symphony-cursor-cli-install/v1" and isinstance(src,dict) and src.get("head")==src.get("originMain") and isinstance(stored,dict) and payload.get("gemCursorExecutable")==expected and all(stored.get(n)==files.get(n) for n in (*units,*bins))
print("RECEIPT_OK" if ok else "RECEIPT_INVALID", file=sys.stdout if ok else sys.stderr); raise SystemExit(0 if ok else 1)
'
}
check_one() { [ -f "$2" ] || { echo "MISSING $2"; return 1; }; cmp -s "$1" "$2" && echo "OK $2" || { echo "DRIFT $2"; return 1; }; }
if [ "$CHECK_ONLY" -eq 1 ]; then
  rc=0
  for name in "${UNITS[@]}"; do check_one "$(src_unit "$name")" "$UNIT_DST/$name" || rc=1; done
  for name in "${BINS[@]}"; do check_one "$(src_bin "$name")" "$BIN_DST/$name" || rc=1; done
  [ -f "$RECEIPT" ] || { echo "MISSING $RECEIPT"; rc=1; }
  [ ! -f "$RECEIPT" ] || receipt check || rc=1
  exit "$rc"
fi
head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)" || { echo "NOT_A_GIT_CHECKOUT $REPO_ROOT" >&2; exit 2; }
main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null)" || { echo "ORIGIN_MAIN_UNAVAILABLE $REPO_ROOT" >&2; exit 2; }
[ "$head_sha" = "$main_sha" ] || { echo "NOT_EXACT_MAIN head=$head_sha origin/main=$main_sha" >&2; exit 2; }
if ! git -C "$REPO_ROOT" diff --quiet -- scripts/symphony/systemd/cursor-cli-worker.service scripts/symphony/systemd/cursor-cli-worker.timer scripts/symphony/cursor-agent-std scripts/symphony/cursor-cli-worker.py \
  || ! git -C "$REPO_ROOT" diff --cached --quiet -- scripts/symphony/systemd/cursor-cli-worker.service scripts/symphony/systemd/cursor-cli-worker.timer scripts/symphony/cursor-agent-std scripts/symphony/cursor-cli-worker.py; then
  echo "DIRTY_SOURCES cursor-cli-worker" >&2; exit 2
fi
mkdir -p "$UNIT_DST" "$BIN_DST" "$(dirname "$RECEIPT")"
for name in "${UNITS[@]}"; do src="$(src_unit "$name")"; dst="$UNIT_DST/$name"; [ -f "$dst" ] && ! cmp -s "$src" "$dst" && cp -p "$dst" "$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"; install -m 0644 "$src" "$dst"; echo "INSTALLED $dst"; done
for name in "${BINS[@]}"; do src="$(src_bin "$name")"; dst="$BIN_DST/$name"; [ -f "$dst" ] && ! cmp -s "$src" "$dst" && cp -p "$dst" "$dst.bak.$(date -u +%Y%m%dT%H%M%SZ)"; install -m 0755 "$src" "$dst"; echo "INSTALLED $dst"; done
receipt write "$head_sha"
if [ "$DAEMON_RELOAD" -eq 1 ]; then [ -n "${XDG_RUNTIME_DIR:-}" ] || export XDG_RUNTIME_DIR="/run/user/$(id -u)"; systemctl --user daemon-reload; echo "DAEMON_RELOADED"; fi
echo "DONE"
