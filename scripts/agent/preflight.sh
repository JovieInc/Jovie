#!/usr/bin/env bash
# scripts/agent/preflight.sh — deterministic agent/autoplan bootstrap (JOV-4183)
#
# Runs ALL preflight checks in one process and emits ONE compact JSON receipt.
# Gate order is cheapest-first: ownership + worktree BEFORE any tooling/upgrade.
#
# Usage:
#   bash scripts/agent/preflight.sh [--task "description"] [--json-only]
#
# Exit codes:
#   0  verdict == "go"
#   1  verdict == "blocked" (hard blockers)
#   2  script internal failure
#
# Env:
#   AGENT_PREFLIGHT_REQUIRE_GBRAIN=1   treat missing/empty gbrain as hard block
#   AGENT_PREFLIGHT_REQUIRE_GSTACK=1   treat missing gstack as hard block
#   AGENT_PREFLIGHT_TASK=...           same as --task
#
# Receipt schema: agent-preflight/v1 — see scripts/agent/PREFLIGHT.md
set -euo pipefail

TASK="${AGENT_PREFLIGHT_TASK:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --task) TASK="${2:-}"; shift 2 ;;
    --json-only) shift ;; # always json-only by design; flag kept for API stability
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

now_ms() {
  python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo $(($(date +%s) * 1000))
}

elapsed() {
  local start="$1"
  echo $(( $(now_ms) - start ))
}

START_TOTAL=$(now_ms)
BLOCKERS_JSON='[]'
append_blocker() {
  local code="$1" msg="$2"
  BLOCKERS_JSON=$(python3 -c '
import json,sys
code,msg,arr=sys.argv[1],sys.argv[2],json.loads(sys.argv[3])
arr.append({"code": code, "message": msg})
print(json.dumps(arr, separators=(",", ":")))
' "$code" "$msg" "$BLOCKERS_JSON")
}

# ─── 1. WORKTREE (cheap, local) — go/no-go before tooling ────────────────────
WT_START=$(now_ms)
WT_ROOT=""
WT_BRANCH=""
WT_CLEAN=true
WT_DETACHED=false
WT_DIRTY=0

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  WT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  if git symbolic-ref -q HEAD >/dev/null 2>&1; then
    WT_BRANCH=$(git branch --show-current 2>/dev/null || true)
    WT_DETACHED=false
  else
    WT_DETACHED=true
    WT_BRANCH=$(git rev-parse --short HEAD 2>/dev/null || echo "DETACHED")
  fi
  # Detached clean worktrees are allowed (acceptance criterion).
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    WT_CLEAN=false
    WT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    append_blocker "worktree_dirty" "Worktree has ${WT_DIRTY} dirty path(s); commit, stash, or discard before autoplan."
  fi
else
  WT_CLEAN=false
  append_blocker "not_a_git_repo" "Not inside a git repository."
fi
WT_MS=$(elapsed "$WT_START")

# ─── 2. OWNERSHIP (coordination) — still before tooling ──────────────────────
OWN_START=$(now_ms)
OWN_OWNER=""
OWN_SCOPE=""
OWN_SOURCE="none"
OWN_REACHABLE=false

if command -v gbrain >/dev/null 2>&1; then
  OWN_SOURCE="gbrain"
  OWN_OUT=""
  # Cap gbrain wait so bootstrap stays cheap even when brain is slow.
  _gb() { if command -v timeout >/dev/null 2>&1; then timeout 5 "$@"; else "$@"; fi; }
  if [ -n "$TASK" ]; then
    OWN_OUT=$(_gb gbrain query "agent ownership and current priorities for: ${TASK}" 2>/dev/null | head -c 2000 || true)
  else
    OWN_OUT=$(_gb gbrain get agent-org-chart 2>/dev/null | head -c 2000 || true)
    if [ -z "$OWN_OUT" ]; then
      OWN_OUT=$(_gb gbrain query "agent org chart ownership coordination" 2>/dev/null | head -c 2000 || true)
    fi
  fi
  if [ -z "$OWN_OUT" ]; then
    OWN_REACHABLE=false
    OWN_SOURCE="gbrain-empty"
    if [ "${AGENT_PREFLIGHT_REQUIRE_GBRAIN:-0}" = "1" ]; then
      append_blocker "gbrain_unreachable" "gbrain returned empty ownership context (AGENT_PREFLIGHT_REQUIRE_GBRAIN=1)."
    fi
  else
    OWN_REACHABLE=true
    # Do not invent owner names from free-text gbrain hits — mark presence only.
    OWN_OWNER="available"
    OWN_SCOPE="${TASK:-repo}"
  fi
else
  OWN_SOURCE="gbrain-missing"
  if [ "${AGENT_PREFLIGHT_REQUIRE_GBRAIN:-0}" = "1" ]; then
    append_blocker "gbrain_missing" "gbrain CLI not on PATH (AGENT_PREFLIGHT_REQUIRE_GBRAIN=1)."
  fi
fi
OWN_MS=$(elapsed "$OWN_START")

# ─── 3. GSTACK (tooling — only after go/no-go above) ─────────────────────────
# Never auto-upgrade here: a blocked ownership/worktree must not pay tooling tax.
GS_START=$(now_ms)
GS_INSTALLED=false
GS_VERSION=""
GS_LATEST=""
GS_POLICY=""
GS_PATH=""

for candidate in \
  "${WT_ROOT:+$WT_ROOT/.agents/skills/gstack/bin}" \
  "${WT_ROOT:+$WT_ROOT/.claude/skills/gstack/bin}" \
  "$HOME/.claude/skills/gstack/bin" \
  "$HOME/.agents/skills/gstack/bin"
do
  if [ -n "${candidate:-}" ] && [ -x "$candidate/gstack-config" ]; then
    GS_PATH="$candidate"
    GS_INSTALLED=true
    break
  fi
done

if [ "$GS_INSTALLED" = true ]; then
  if [ -f "$GS_PATH/../VERSION" ]; then
    GS_VERSION=$(tr -d '[:space:]' < "$GS_PATH/../VERSION" 2>/dev/null || true)
  elif [ -f "$GS_PATH/../package.json" ]; then
    GS_VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$GS_PATH/../package.json" 2>/dev/null || true)
  fi
  if [ -x "$GS_PATH/gstack-config" ]; then
    GS_POLICY=$("$GS_PATH/gstack-config" get upgrade_policy 2>/dev/null || \
                "$GS_PATH/gstack-config" get gstack_upgrade_policy 2>/dev/null || \
                echo "unknown")
  fi
  if [ -x "$GS_PATH/gstack-update-check" ]; then
    UPD_OUT=$("$GS_PATH/gstack-update-check" 2>/dev/null || true)
    case "$UPD_OUT" in
      UPGRADE_AVAILABLE*|JUST_UPGRADED*)
        GS_LATEST=$(echo "$UPD_OUT" | awk '{print $3}')
        ;;
    esac
  fi
else
  if [ "${AGENT_PREFLIGHT_REQUIRE_GSTACK:-0}" = "1" ]; then
    append_blocker "gstack_missing" "gstack bin not found (AGENT_PREFLIGHT_REQUIRE_GSTACK=1)."
  fi
fi
GS_MS=$(elapsed "$GS_START")

# ─── 4. GOAL state ───────────────────────────────────────────────────────────
GOAL_START=$(now_ms)
GOAL_ACTIVE=false
GOAL_ID=""
GOAL_PATH=""

for gp in \
  "${WT_ROOT:+$WT_ROOT/.context/active-goal.json}" \
  "${WT_ROOT:+$WT_ROOT/.context/goal.json}" \
  "$HOME/.gstack/active-goal.json" \
  "$HOME/.gstack/goals/active.json"
do
  if [ -n "${gp:-}" ] && [ -f "$gp" ]; then
    GOAL_PATH="$gp"
    GOAL_ACTIVE=true
    GOAL_ID=$(python3 -c '
import json,sys
try:
  d=json.load(open(sys.argv[1]))
  print(d.get("id") or d.get("goal_id") or d.get("slug") or "")
except Exception:
  print("")
' "$gp" 2>/dev/null || true)
    break
  fi
done
GOAL_MS=$(elapsed "$GOAL_START")

# ─── Verdict ─────────────────────────────────────────────────────────────────
VERDICT="go"
if [ "$BLOCKERS_JSON" != "[]" ]; then
  VERDICT="blocked"
fi
MS_TOTAL=$(elapsed "$START_TOTAL")

export _OWN_OWNER="$OWN_OWNER" _OWN_SCOPE="$OWN_SCOPE" _OWN_SOURCE="$OWN_SOURCE"
export _OWN_REACHABLE="$OWN_REACHABLE" _OWN_MS="$OWN_MS"
export _WT_CLEAN="$WT_CLEAN" _WT_DETACHED="$WT_DETACHED" _WT_BRANCH="$WT_BRANCH"
export _WT_ROOT="$WT_ROOT" _WT_DIRTY="$WT_DIRTY" _WT_MS="$WT_MS"
export _GS_INSTALLED="$GS_INSTALLED" _GS_VERSION="$GS_VERSION" _GS_LATEST="$GS_LATEST"
export _GS_POLICY="$GS_POLICY" _GS_PATH="$GS_PATH" _GS_MS="$GS_MS"
export _GOAL_ACTIVE="$GOAL_ACTIVE" _GOAL_ID="$GOAL_ID" _GOAL_PATH="$GOAL_PATH" _GOAL_MS="$GOAL_MS"

python3 - "$VERDICT" "$BLOCKERS_JSON" "$MS_TOTAL" <<'PY'
import json, sys, os

verdict = sys.argv[1]
blockers = json.loads(sys.argv[2])
ms_total = int(sys.argv[3])

def s(k):
    v = os.environ.get(k)
    return v if v else None

def b(k):
    return os.environ.get(k) == "true"

def n(k):
    try:
        return int(os.environ.get(k) or 0)
    except ValueError:
        return 0

receipt = {
  "schema": "agent-preflight/v1",
  "ownership": {
    "owner": s("_OWN_OWNER"),
    "scope": s("_OWN_SCOPE"),
    "source": s("_OWN_SOURCE") or "none",
    "reachable": b("_OWN_REACHABLE"),
    "ms": n("_OWN_MS"),
  },
  "worktree": {
    "clean": b("_WT_CLEAN"),
    "detached": b("_WT_DETACHED"),
    "branch": s("_WT_BRANCH"),
    "root": s("_WT_ROOT"),
    "dirty_paths": n("_WT_DIRTY"),
    "ms": n("_WT_MS"),
  },
  "gstack": {
    "installed": b("_GS_INSTALLED"),
    "version": s("_GS_VERSION"),
    "latest": s("_GS_LATEST"),
    "policy": s("_GS_POLICY"),
    "path": s("_GS_PATH"),
    "ms": n("_GS_MS"),
  },
  "goal": {
    "active": b("_GOAL_ACTIVE"),
    "id": s("_GOAL_ID"),
    "path": s("_GOAL_PATH"),
    "ms": n("_GOAL_MS"),
  },
  "verdict": verdict,
  "blockers": blockers,
  "ms_total": ms_total,
}
print(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True))
PY

if [ "$VERDICT" = "blocked" ]; then
  exit 1
fi
exit 0
