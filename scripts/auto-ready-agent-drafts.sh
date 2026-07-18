#!/usr/bin/env bash
# Auto-Ready Agent Drafts
#
# Finds agent-owned draft PRs that are MERGEABLE with zero failing terminal
# checks and flips them to "ready for review". The merge-queue autoenroll
# workflow then picks them up.
#
# Opt out per-PR with any of: needs-human, hold, gated, queue-deferred, fast.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
#   ATTEMPT_COOLDOWN_HOURS    min hours between flip attempts per PR (default 6)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
# Idempotency guard (#13342): one marker comment per PR, edited in place, and a
# hard cap of one flip attempt per PR per ATTEMPT_COOLDOWN_HOURS. Without this,
# a PR the token cannot actually flip (see #13122) gets an identical
# "Enrolling in merge queue" comment every cron cycle — 221 in 12h observed.
READY_MARKER="auto-ready"
ATTEMPT_COOLDOWN_HOURS="${ATTEMPT_COOLDOWN_HOURS:-6}"
HOLD_LABEL_RE='^(needs-human|hold|gated|queue-deferred|fast)$'
now_epoch="$(date -u +%s)"

mark_ready() {  # mark_ready <num> — returns non-zero when the flip call failed
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would mark #$1 ready"; return 0; }
  if gh_retry pr ready "$1" -R "$REPO" >/dev/null 2>&1; then
    echo "    ✓ marked #$1 ready"
    return 0
  fi
  echo "    !! failed to mark #$1 ready"
  return 1
}

# Upsert the single auto-ready status comment (edited in place on repeat runs).
upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert status comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$1" "$READY_MARKER" "$2" \
    && echo "    ✓ upserted status comment on #$1" || echo "    !! failed to upsert status comment on #$1"
}

# Hours since the last auto-ready attempt marker comment on this PR. Empty
# output means "never attempted" (treated as cooldown-elapsed).
last_attempt_age_hours() {  # last_attempt_age_hours <num>
  local n="$1"
  local updated_at
  updated_at="$(gh_retry api "repos/${REPO}/issues/${n}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${READY_MARKER} -->\")) | .updated_at] | last" \
    2>/dev/null | grep -E '^[0-9]{4}-' | tail -n1 || true)"
  [[ -z "$updated_at" || "$updated_at" == "null" ]] && { echo ""; return 0; }
  local updated_epoch
  updated_epoch="$(date -u -d "$updated_at" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$updated_at")"
  echo $(( (now_epoch - updated_epoch) / 3600 ))
}

# Read mutation-critical fields in one API snapshot. Discovery is never
# authorization: every promotion is pinned to this exact head and live labels.
read_state() {  # read_state <num>
  gh_retry pr view "$1" -R "$REPO" \
    --json isDraft,headRefOid,headRefName,labels,mergeable,state \
    --jq '{draft: .isDraft, head: .headRefOid, branch: .headRefName, labels: [.labels[].name], mergeable: .mergeable, state: .state}'
}

state_is_eligible_draft() {  # state_is_eligible_draft <json> <expected-head> <expected-branch>
  jq -e --arg expected_head "$2" --arg expected_branch "$3" --arg hold_re "$HOLD_LABEL_RE" '
    .state == "OPEN"
    and .draft == true
    and .head == $expected_head
    and .branch == $expected_branch
    and .mergeable == "MERGEABLE"
    and ([.labels[] | select(test($hold_re))] | length == 0)
  ' <<<"$1" >/dev/null
}

undo_ready() {  # undo_ready <num> — fail closed and verify the compensation
  local n="$1"
  if ! gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1; then
    echo "    !! compensating draft restore failed for #$n"
    return 1
  fi

  local restored
  if ! restored="$(read_state "$n" 2>/dev/null)"; then
    echo "    !! could not verify compensating draft restore for #$n"
    return 1
  fi
  if jq -e '.state != "OPEN" or .draft == true' <<<"$restored" >/dev/null; then
    echo "    ✓ compensated: restored #$n to draft"
    return 0
  fi

  echo "    !! #$n remained ready after compensating draft restore"
  return 1
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local raw_file out_file err_file err delay
  raw_file="$(mktemp)"
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$raw_file"
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --json name,bucket,state,workflow,description,startedAt,completedAt >"$raw_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
        && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
          --classify-auto-ready <"$raw_file" >"$out_file"; then
        cat "$out_file"
        rm -f "$raw_file" "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
      && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
        --classify-auto-ready <"$raw_file" >"$out_file"; then
      cat "$out_file"
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$raw_file" "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

echo "=== AUTO-READY: scanning for green agent drafts ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRefOid --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    oid: .headRefOid,
    L: [.labels[].name]
  } ]')"

# Flip green agent drafts to ready
echo "=== FLIP: draft + agent + mergeable + 0 failing checks → ready ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft)
  | select(.m == "MERGEABLE")
  | select((.head | test("^(tim/|codex/|agent/|claude/|linear/|codegen-bot/)")))
  | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "fast") | not)' \
  | while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    expected_head=$(jq -r '.oid' <<<"$pr")
    expected_branch=$(jq -r '.head' <<<"$pr")
    echo "  #$n  $t"

    # Idempotency guard (#13342): at most one attempt per PR per cooldown window.
    attempt_age_h="$(last_attempt_age_hours "$n")"
    if [[ -n "$attempt_age_h" && "$attempt_age_h" -lt "$ATTEMPT_COOLDOWN_HOURS" ]]; then
      echo "    ~ last attempt ${attempt_age_h}h ago (< ${ATTEMPT_COOLDOWN_HOURS}h cooldown); skipping"
      continue
    fi

    # The list snapshot is discovery only. Re-read the exact head, draft bit,
    # mergeability, and live labels before consulting checks.
    if ! before="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not read live PR state; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before" "$expected_head" "$expected_branch"; then
      echo "    ~ live state no longer matches the eligible draft snapshot; leaving draft"
      continue
    fi

    fail="$(check_failures_for_pr "$n")"
    if [[ "$(jq 'length' <<<"$fail")" -ne 0 ]]; then
      echo "    ~ required checks are not exact-head green: $(jq -r 'join(", ")' <<<"$fail")"
      continue
    fi

    # Checks and labels can change while the API call above is in flight. This
    # second snapshot is the actual mutation precondition.
    if ! before_mutation="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not re-read live PR state before mutation; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before_mutation" "$expected_head" "$expected_branch"; then
      echo "    ~ head, labels, or draft state changed before mutation; leaving draft"
      continue
    fi

    if ! mark_ready "$n"; then
      upsert_status_comment "$n" "⚠️ Auto-ready: all required checks are passing, but marking this PR ready for review **failed** (likely a token-permission gap — see #13122). A human needs to flip it to ready. Will retry in ${ATTEMPT_COOLDOWN_HOURS}h. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    [[ "$DRY_RUN" == "1" ]] && continue

    # Verify the exact head and live labels after the mutation. If a hold label
    # or new head raced the promotion, restore draft status immediately so the
    # now-unproven revision cannot be enrolled.
    if ! after="$(read_state "$n" 2>/dev/null)"; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: the ready transition could not be verified, so a compensating draft restore was attempted. Re-run after the current head and labels stabilize. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    head_after="$(jq -r '.head // ""' <<<"$after")"
    branch_after="$(jq -r '.branch // ""' <<<"$after")"
    draft_after="$(jq -r '.draft' <<<"$after")"
    state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
    held_after="$(jq -r --arg hold_re "$HOLD_LABEL_RE" '[.labels[] | select(test($hold_re))] | join(",")' <<<"$after")"

    if [[ "$state_after" == "OPEN" && "$draft_after" == "false" && "$head_after" == "$expected_head" && "$branch_after" == "$expected_branch" && -z "$held_after" ]]; then
      upsert_status_comment "$n" "🤖 Auto-ready: all required checks passing — marked ready for review and enrolling in merge queue. _(verified ready at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    elif [[ "$state_after" == "OPEN" && "$draft_after" == "false" ]]; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: the PR changed during promotion (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`), so it was restored to draft. Re-run checks on the live head before promoting it again. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    else
      upsert_status_comment "$n" "⚠️ Auto-ready: \`gh pr ready\` reported success but the verified state is state=${state_after}, draft=${draft_after}. No queue enrollment was claimed. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
