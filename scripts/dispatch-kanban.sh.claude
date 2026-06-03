#!/bin/bash
# Kanban auto-dispatch script for Jovie Product
# Reads ~/.hermes/boards/jovie-product.json, picks "ready" unblocked tasks,
# dispatches to Claude Code (subscription-billed), updates board + Linear.
#
# Usage: ./scripts/dispatch-kanban.sh [--dry-run]
# Cron:  */30 * * * * /Users/timwhite/jovie/scripts/dispatch-kanban.sh
set -euo pipefail

BOARD="${HOME}/.hermes/boards/jovie-product.json"
REPO="/Users/timwhite/jovie"
LOG="${HOME}/.hermes/logs/dispatch-kanban.log"
mkdir -p "$(dirname "$LOG")"

log()  { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; echo "  $*"; }
err()  { echo "[ERR] $*" >&2; log "ERR: $*"; }

# --- helpers ---

get_secret() {
  cd "$REPO" && doppler run --project jovie-web --config dev -- printenv "$1" 2>/dev/null || echo ""
}

update_board() {
  local task_id="$1" new_status="$2"
  python3 -c "
import json
p = '/Users/timwhite/.hermes/boards/jovie-product.json'
with open(p) as f: b = json.load(f)
for t in b['tasks']:
    if t['id'] == '${task_id}':
        t['status'] = '${new_status}'
        break
with open(p, 'w') as f: json.dump(b, f, indent=2)
" 2>/dev/null && log "board: $task_id -> $new_status" || err "board update failed for $task_id"
}

mark_linear() {
  local linear_id="$1"
  local key="${LINEAR_API_KEY:-$(get_secret LINEAR_API_KEY)}"
  [ -z "$key" ] && return 0
  local sid="721e032a-fe72-4374-9a61-d9976d079e1e"
  local iid
  iid=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $key" \
    -d "{\"query\":\"{ issueSearch(term:\\\"$linear_id\\\") { nodes { id identifier } } }\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print([n['id'] for n in d['data']['issueSearch']['nodes'] if n['identifier']=='$linear_id'][0] if any(n['identifier']=='$linear_id' for n in d['data']['issueSearch']['nodes']) else '')" 2>/dev/null) || true
  if [ -n "$iid" ]; then
    curl -s -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: $key" \
      -d "{\"query\":\"mutation { issueUpdate(id:\\\"$iid\\\", input: { stateId: \\\"$sid\\\" }) { success } }\"}" > /dev/null
    log "linear: $linear_id -> In Progress"
  fi
}

dispatch_claude() {
  local id="$1" linear_id="$2" prompt="$3" turns="${4:-40}"

  log "dispatch: $id ($linear_id) max_turns=$turns"
  if [ "${1:-}" = "--dry-run" ]; then
    echo "    DRY RUN"
    return 0
  fi

  mark_linear "$linear_id" || true
  update_board "$id" "in-progress"

  set +e
  OUTPUT=$(claude -p "$prompt" --max-turns "$turns" --print 2>&1)
  EXIT=$?
  set -e

  echo "$OUTPUT" >> "$LOG"

  if [ $EXIT -eq 0 ]; then
    if echo "$OUTPUT" | grep -qiE "(PR created|branch.*pushed|committed|Merge|merge|https://github.com.*/pull/)"; then
      update_board "$id" "review"
      echo "    OK: PR created"
    else
      update_board "$id" "done"
      echo "    OK: completed (exit 0)"
    fi
  else
    echo "    FAIL: exit $EXIT (log: $LOG)"
    update_board "$id" "ready"
  fi
}

# === MAIN ===

cd "$REPO"
git fetch origin main 2>/dev/null || true

python3 -c "
import json
with open('${BOARD}') as f: b = json.load(f)
ready = [t for t in b['tasks'] if t['status'] == 'ready']
unblocked = [t for t in ready if not t.get('blockers')]
blocked = [t for t in ready if t.get('blockers')]
print(f'Board: {len(b[\"tasks\"])} total, {len(ready)} ready, {len(unblocked)} unblocked, {len(blocked)} blocked')
"

# Check what's pending and dispatch
# pr-8465: merge Phase 6
STATUS_8465=$(python3 -c "import json;b=json.load(open('/Users/timwhite/.hermes/boards/jovie-product.json'));print([t['status'] for t in b['tasks'] if t['id']=='pr-8465'][0])" 2>/dev/null)
if [ "$STATUS_8465" = "ready" ] || [ "$STATUS_8465" = "review" ]; then
  dispatch_claude "pr-8465" "JOV-2024" \
    "Working directory: /Users/timwhite/jovie. Tim approved merging PR #8465 (Phase 6 profile hardening). Tasks: (1) git checkout main && git pull origin main (2) gh pr merge 8465 --squash --subject \"fix(profile): Phase 6 scroll/viewport/safe-area hardening (JOV-2024)\" (3) git push origin main (4) git branch -D fix/profile-hardening-phase-6-scroll 2>/dev/null || true (5) git push origin --delete fix/profile-hardening-phase-6-scroll 2>/dev/null || true" \
    15
fi

# pr-8470: Phase 7 tokens
STATUS_8470=$(python3 -c "import json;b=json.load(open('/Users/timwhite/.hermes/boards/jovie-product.json'));print([t['status'] for t in b['tasks'] if t['id']=='pr-8470'][0])" 2>/dev/null)
if [ "$STATUS_8470" = "ready" ]; then
  dispatch_claude "pr-8470" "JOV-2025" \
    "Working directory: /Users/timwhite/jovie. Profile hardening Phase 7 (JOV-2025): token cleanup and legacy component removal. Tasks: (1) cd /Users/timwhite/jovie (2) git checkout main && git pull origin main (3) git checkout -b fix/profile-hardening-phase-7-tokens (4) Scan apps/web/components/features/profile/ for unused/legacy components and remove dead code (5) Replace hardcoded values with design tokens from DESIGN.md and tailwind.config.ts (6) Run pnpm --filter @jovie/web run typecheck -- --pretty false (7) Run pnpm biome check --write apps/web/components/features/profile (8) git add -A && git commit -m \"fix(profile): token cleanup and legacy component removal (JOV-2025)\" (9) git push -u origin fix/profile-hardening-phase-7-tokens (10) gh pr create --fill --draft --title \"fix(profile): token cleanup and legacy component removal (JOV-2025)\" --body \"Phase 7 of profile hardening: removes unused components, replaces hardcoded values with design tokens. Part of the Public Profile Hardening epic.\"" \
    60
fi

# ci-2049: CI fix
STATUS_CI=$(python3 -c "import json;b=json.load(open('/Users/timwhite/.hermes/boards/jovie-product.json'));print([t['status'] for t in b['tasks'] if t['id']=='ci-2049'][0])" 2>/dev/null)
if [ "$STATUS_CI" = "ready" ]; then
  dispatch_claude "ci-2049" "JOV-2049" \
    "Working directory: /Users/timwhite/jovie. Fix CI knip false positive and stuck unit shards (JOV-2049). Tasks: (1) cd /Users/timwhite/jovie (2) git checkout main && git pull origin main (3) git checkout -b fix/ci-knip-false-positive (4) Read knip.json and understand the knip configuration (5) Run pnpm knip 2>&1 | head -50 (6) Check if the knip false positive references stale paths. Fix any misconfigurations. (7) Run pnpm --filter web exec vitest run --shard=1/6 --reporter=verbose 2>&1 | tail -30 (8) Run pnpm --filter @jovie/web run typecheck  (9) git add -A && git commit -m \"fix(ci): resolve knip false positive (JOV-2049)\" (10) git push -u origin fix/ci-knip-false-positive (11) gh pr create --fill --draft" \
    40
fi

echo "---"
echo "Done. Check $LOG for details."
