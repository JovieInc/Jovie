#!/usr/bin/env bash
# Kanban auto-dispatch for Jovie Product — fire-and-forget with exit markers.
#
# Three phases per tick (cron every 10–30m):
#   1. REAP  — consume exit markers / detect dead processes, free stale cards
#   2. SOW   — dispatch at most one ready unblocked task to Claude Code
#   3. CACHE — best-effort board summary to gbrain
#
# Exit-marker contract (JOV-4049):
#   MARKER_DIR/<task_id>.pid   — subshell PID while running
#   MARKER_DIR/<task_id>.exit  — numeric exit code written AFTER the agent exits
# Never infer success from log greps; the marker is the only success/fail signal.
#
# Versioned source of truth: this file (repo).
# Cron target: ~/.hermes/scripts/dispatch-kanban.sh (sync after edit).
#
# Usage: ./scripts/dispatch-kanban.sh [--dry-run] [--board <path>]
# Cron:  */15 * * * * /Users/timwhite/Jovie/scripts/dispatch-kanban.sh
set -euo pipefail

export PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

DRY_RUN=false
BOARD="${HOME}/.hermes/boards/jovie-product.json"
REPO="${JOVIE_REPO:-${HOME}/Jovie}"
LOG="${HOME}/.hermes/logs/dispatch-kanban.log"
SESSION_DIR="${HOME}/.hermes/logs/claude-sessions"
MARKER_DIR="${HOME}/.hermes/run/dispatch-markers"
NOTIFY_SCRIPT="${HOME}/.hermes/scripts/notify-dispatch-crash.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --board) BOARD="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) break ;;
  esac
done

CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "FATAL: claude CLI not found on PATH (resolved='$CLAUDE_BIN')" >&2
  exit 1
fi

mkdir -p "$SESSION_DIR" "$MARKER_DIR" "$(dirname "$LOG")"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
err()  { echo "[ERR] $*" >&2; log "ERR: $*"; }

get_secret() {
  if [ ! -d "$REPO" ]; then
    echo ""
    return 0
  fi
  (cd "$REPO" && doppler run --project jovie-web --config dev -- printenv "$1" 2>/dev/null) || echo ""
}

notify_crash() {
  local task_id="$1" reason="$2"
  if [ -x "$NOTIFY_SCRIPT" ]; then
    "$NOTIFY_SCRIPT" "$task_id" "$reason" >>"$LOG" 2>&1 || true
  elif command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${task_id}: ${reason}\" with title \"Kanban Dispatch Crash\"" 2>/dev/null || true
  fi
  log "notify: $task_id — $reason"
}

# --- Linear In Progress (best-effort) ---
mark_linear_in_progress() {
  local linear_id="$1"
  [ -z "$linear_id" ] && return 0
  [[ "$linear_id" == "JOV-XXXX" ]] && return 0
  local key="${LINEAR_API_KEY:-$(get_secret LINEAR_API_KEY)}"
  [ -z "$key" ] && return 0
  local sid="721e032a-fe72-4374-9a61-d9976d079e1e"
  local iid
  iid=$(
    LINEAR_API_KEY="$key" LINEAR_ID="$linear_id" python3 <<'PY' 2>/dev/null
import json, os, urllib.request
linear_id = os.environ["LINEAR_ID"]
payload = {
    "query": "query($term: String!) { issueSearch(term: $term) { nodes { id identifier } } }",
    "variables": {"term": linear_id},
}
req = urllib.request.Request(
    "https://api.linear.app/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": os.environ["LINEAR_API_KEY"],
    },
)
with urllib.request.urlopen(req, timeout=20) as resp:
    data = json.load(resp)
print(
    next(
        (
            n["id"]
            for n in data.get("data", {}).get("issueSearch", {}).get("nodes", [])
            if n.get("identifier") == linear_id
        ),
        "",
    )
)
PY
  ) || true
  [ -z "$iid" ] && return 0
  LINEAR_API_KEY="$key" LINEAR_ISSUE_ID="$iid" LINEAR_STATE_ID="$sid" python3 <<'PY' >/dev/null 2>&1 || true
import json, os, urllib.request
payload = {
    "query": "mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }",
    "variables": {
        "id": os.environ["LINEAR_ISSUE_ID"],
        "stateId": os.environ["LINEAR_STATE_ID"],
    },
}
req = urllib.request.Request(
    "https://api.linear.app/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": os.environ["LINEAR_API_KEY"],
    },
)
with urllib.request.urlopen(req, timeout=20) as resp:
    resp.read()
PY
  log "linear: $linear_id -> In Progress"
}

# =============================================================================
# Phase 1 — REAP
# =============================================================================
reap_sessions() {
  log "REAP: scanning in-progress tasks"
  BOARD="$BOARD" MARKER_DIR="$MARKER_DIR" REPO="$REPO" DRY_RUN="$DRY_RUN" python3 <<'PY'
import json, os, subprocess, sys

board_path = os.environ["BOARD"]
marker_dir = os.environ["MARKER_DIR"]
repo = os.environ.get("REPO", "")
dry_run = os.environ.get("DRY_RUN", "false") == "true"

if not os.path.exists(board_path):
    print(f"REAP: board missing at {board_path}", file=sys.stderr)
    sys.exit(0)

with open(board_path) as f:
    board = json.load(f)

changed = False
actions = []

for t in list(board.get("tasks", [])):
    if t.get("status") != "in-progress":
        continue
    tid = t["id"]
    marker = os.path.join(marker_dir, f"{tid}.exit")
    pidfile = os.path.join(marker_dir, f"{tid}.pid")

    if not os.path.exists(marker):
        alive = False
        if os.path.exists(pidfile):
            try:
                with open(pidfile) as pf:
                    pid = int(pf.read().strip())
                os.kill(pid, 0)
                alive = True
                actions.append(f"{tid}: still running (pid {pid})")
            except (OSError, ValueError):
                alive = False
        if alive:
            continue
        # Dead without exit marker — release card so the loop can retry
        actions.append(f"{tid}: stale (process died without exit marker)")
        if not dry_run:
            t["status"] = "ready"
            t["last_error"] = "stale (process died without exit marker)"
            t.pop("pid", None)
            changed = True
            # Cleanup pidfile
            try:
                os.remove(pidfile)
            except OSError:
                pass
        continue

    # Marker present — consume exit code
    try:
        with open(marker) as mf:
            exit_code = int(mf.read().strip())
    except (OSError, ValueError):
        exit_code = 1

    if exit_code == 0:
        pr_num = ""
        try:
            result = subprocess.run(
                [
                    "gh", "pr", "list",
                    "--state", "open",
                    "--author", "@me",
                    "--limit", "5",
                    "--json", "number,createdAt",
                    "--jq", "sort_by(.createdAt) | reverse | .[0].number // empty",
                ],
                capture_output=True,
                text=True,
                cwd=repo or None,
                timeout=30,
            )
            pr_num = (result.stdout or "").strip()
        except Exception:
            pr_num = ""
        if pr_num:
            actions.append(f"{tid}: SUCCESS -> review (PR #{pr_num})")
            if not dry_run:
                t["status"] = "review"
                t["pr"] = f"https://github.com/JovieInc/Jovie/pull/{pr_num}"
                t.pop("last_error", None)
                changed = True
        else:
            actions.append(f"{tid}: SUCCESS (exit 0, no open PR) -> done")
            if not dry_run:
                t["status"] = "done"
                t.pop("last_error", None)
                changed = True
    else:
        actions.append(f"{tid}: FAILED (exit {exit_code}) -> ready")
        if not dry_run:
            t["status"] = "ready"
            t["last_error"] = f"exit {exit_code}"
            changed = True

    if not dry_run:
        for path in (marker, pidfile):
            try:
                os.remove(path)
            except OSError:
                pass

if changed and not dry_run:
    with open(board_path, "w") as f:
        json.dump(board, f, indent=2)
        f.write("\n")

for a in actions:
    print(a)
if not actions:
    print("REAP: nothing to reclaim")
PY
}

# =============================================================================
# Phase 2 — SOW (dispatch next)
# =============================================================================
build_prompt() {
  local linear_id="$1" task_id="$2" title="$3"
  local linear_slug
  linear_slug=$(printf '%s' "$linear_id" | tr '[:upper:]' '[:lower:]')
  cat <<EOF
You are Claude Code shipping one Jovie kanban task end-to-end.

Working directory: ${REPO}
Board task: ${task_id}
Linear: ${linear_id}
Title: ${title}

QUALITY GATES — execute in order, do not skip:
1. export JOVIE_AGENT_PROFILE=coder
2. git checkout main && git pull origin main
3. Create a scoped branch: fix/<scope>-${linear_slug} (or feat/)
4. Implement the smallest correct change for this task only
5. Run: pnpm --filter @jovie/web run typecheck -- --pretty false
6. Run: pnpm biome check --write <edited paths>
7. Run focused tests if applicable
8. git add -A && git commit -m 'type(scope): description (${linear_id})'
9. git push -u origin HEAD
10. gh pr create --fill  # ready PR when green; draft OK while iterating

CRITICAL:
- Do NOT modify drizzle/migrations that already exist on main
- Do NOT use --no-verify
- Do NOT invent secrets
- Prefer deletion over addition
- COMMIT AND PUSH as last action when the change is real
EOF
}

sow_next() {
  log "SOW: picking next ready task"
  if [ ! -f "$BOARD" ]; then
    err "board missing: $BOARD"
    return 1
  fi

  local task_json
  task_json=$(
    BOARD="$BOARD" python3 <<'PY'
import json, os, sys
with open(os.environ["BOARD"]) as f:
    b = json.load(f)
in_progress = [t for t in b.get("tasks", []) if t.get("status") == "in-progress"]
if in_progress:
    print("IN_PROGRESS")
    sys.exit(0)
ready = [
    t for t in b.get("tasks", [])
    if t.get("status") == "ready" and not t.get("blockers")
]
if not ready:
    print("EMPTY")
    sys.exit(0)
ready.sort(key=lambda t: (t.get("tier", 99), t.get("priority", 99), t["id"]))
t = ready[0]
print(json.dumps({
    "id": t["id"],
    "linear_id": t.get("linear_id") or t.get("linear") or "",
    "title": t.get("title") or t["id"],
    "tier": t.get("tier", 99),
}))
PY
  )

  case "$task_json" in
    IN_PROGRESS)
      log "SOW: a task is already in-progress — skip dispatch"
      return 0
      ;;
    EMPTY)
      log "SOW: no ready unblocked tasks"
      return 0
      ;;
  esac

  local task_id linear_id title tier turns
  task_id=$(echo "$task_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  linear_id=$(echo "$task_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('linear_id',''))")
  title=$(echo "$task_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")
  tier=$(echo "$task_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tier',99))")

  if [ "$tier" -le 1 ] 2>/dev/null; then turns=40
  elif [ "$tier" -le 2 ] 2>/dev/null; then turns=60
  else turns=80
  fi

  log "SOW: dispatch $task_id ($linear_id) tier=$tier turns=$turns"

  if [ "$DRY_RUN" = true ]; then
    echo "    DRY RUN — would dispatch $task_id"
    return 0
  fi

  # Mark board in-progress BEFORE launching so concurrent ticks see the claim
  BOARD="$BOARD" TASK_ID="$task_id" python3 <<'PY'
import json, os
path = os.environ["BOARD"]
tid = os.environ["TASK_ID"]
with open(path) as f:
    b = json.load(f)
for t in b["tasks"]:
    if t["id"] == tid:
        t["status"] = "in-progress"
        t.pop("last_error", None)
        break
with open(path, "w") as f:
    json.dump(b, f, indent=2)
    f.write("\n")
PY

  mark_linear_in_progress "$linear_id" || true

  local prompt logfile marker pidfile
  prompt="$(build_prompt "$linear_id" "$task_id" "$title")"
  logfile="${SESSION_DIR}/${task_id}.log"
  marker="${MARKER_DIR}/${task_id}.exit"
  pidfile="${MARKER_DIR}/${task_id}.pid"

  # Remove any leftover markers from a previous attempt
  rm -f "$marker" "$pidfile"

  # Fire-and-forget: write PID immediately, write exit marker ONLY when the
  # agent process exits. REAP consumes the marker on the next cron tick.
  (
    echo "$$" >"$pidfile"
    {
      echo "==== dispatch $(date -u +%Y-%m-%dT%H:%M:%SZ) task=$task_id ===="
      echo "claude: $CLAUDE_BIN"
      echo "repo: $REPO"
    } >>"$logfile"
    set +e
    cd "$REPO" || exit 90
    "$CLAUDE_BIN" -p "$prompt" --max-turns "$turns" --print >>"$logfile" 2>&1
    code=$?
    set -e
    echo "$code" >"$marker"
    # If non-zero, best-effort notify (macOS notification / optional script)
    if [ "$code" -ne 0 ]; then
      if [ -x "$NOTIFY_SCRIPT" ]; then
        "$NOTIFY_SCRIPT" "$task_id" "exit $code" >>"$logfile" 2>&1 || true
      elif command -v osascript >/dev/null 2>&1; then
        osascript -e "display notification \"${task_id} exited ${code}\" with title \"Kanban Dispatch Crash\"" 2>/dev/null || true
      fi
    fi
  ) >/dev/null 2>&1 &

  local bg_pid=$!
  # Prefer the subshell PID we just forked (pidfile is written by subshell with $$)
  # Give the subshell a moment to write the pidfile; fall back to $!
  sleep 0.2
  if [ -f "$pidfile" ]; then
    log "SOW: launched $task_id pid=$(cat "$pidfile") log=$logfile"
  else
    echo "$bg_pid" >"$pidfile"
    log "SOW: launched $task_id pid=$bg_pid (fallback) log=$logfile"
  fi
}

# =============================================================================
# Phase 3 — CACHE (best-effort)
# =============================================================================
cache_state() {
  if ! command -v gbrain >/dev/null 2>&1; then
    return 0
  fi
  BOARD="$BOARD" timeout 8 python3 <<'PY' 2>/dev/null || true
import json, os, subprocess
path = os.environ["BOARD"]
if not os.path.exists(path):
    raise SystemExit(0)
with open(path) as f:
    b = json.load(f)
lines = ["# Kanban State Summary", ""]
for s in ("ready", "in-progress", "review", "done", "blocked"):
    n = sum(1 for t in b.get("tasks", []) if t.get("status") == s)
    lines.append(f"- {s}: {n}")
body = "\n".join(lines) + "\n"
subprocess.run(
    ["gbrain", "put", "jovie/state/board-summary"],
    input=body,
    text=True,
    timeout=5,
    check=False,
)
PY
}

# =============================================================================
# MAIN
# =============================================================================
log "=== dispatch-kanban start dry_run=$DRY_RUN board=$BOARD ==="

if [ ! -d "$REPO" ]; then
  # Fall back to common checkout paths
  for candidate in "${HOME}/jovie" "${HOME}/conductor/repos/jovie-v1" "/private/tmp/jovie-worktrees/todo-misc-ops-product"; do
    if [ -d "$candidate/.git" ]; then
      REPO="$candidate"
      break
    fi
  done
fi

# Capture REAP stdout so we only notify on transitions that happened this tick
REAP_OUT="$(reap_sessions 2>&1 | tee -a "$LOG")" || true
if [ "$DRY_RUN" = false ]; then
  while IFS= read -r line; do
    case "$line" in
      *": stale (process died without exit marker)")
        tid="${line%%:*}"
        notify_crash "$tid" "stale (process died without exit marker)"
        ;;
      *": FAILED (exit "*)
        tid="${line%%:*}"
        reason="${line#*: }"
        notify_crash "$tid" "$reason"
        ;;
    esac
  done <<<"$REAP_OUT"
fi

sow_next
cache_state

log "=== dispatch-kanban done ==="
echo "Done. Log: $LOG"
