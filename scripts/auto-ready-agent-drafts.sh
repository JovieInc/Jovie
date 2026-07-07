#!/usr/bin/env bash
# Auto-Ready Agent Drafts
#
# Finds agent-owned draft PRs that are MERGEABLE with zero failing terminal
# checks and flips them to "ready for review". The merge-queue autoenroll
# workflow then picks them up.
#
# Opt out per-PR with any of: needs-human, hold, gated, fast.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
#   ATTEMPT_COOLDOWN_HOURS    min hours between flip attempts per PR (default 6)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|dependabot/)'
# Idempotency guard (#13342): one marker comment per PR, edited in place, and a
# hard cap of one flip attempt per PR per ATTEMPT_COOLDOWN_HOURS. Without this,
# a PR the token cannot actually flip (see #13122) gets an identical
# "Enrolling in merge queue" comment every cron cycle — 221 in 12h observed.
READY_MARKER="auto-ready"
ATTEMPT_COOLDOWN_HOURS="${ATTEMPT_COOLDOWN_HOURS:-6}"
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

# Re-query the PR and confirm the draft flip actually landed before claiming
# success — `gh pr ready` can fail silently on token-permission gaps (#13122).
is_still_draft() {  # is_still_draft <num> — echoes true/false/unknown
  gh_retry pr view "$1" -R "$REPO" --json isDraft --jq '.isDraft' 2>/dev/null || echo "unknown"
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  # TERMINAL failures only. Same filter as drain-pr-queue.sh.
  local jq_filter='[
    .[]
    | select(
        ((.bucket // "") | test("^fail$"; "i"))
        or ((.state // "") | test("^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$"; "i"))
      )
    | select(((.name // "") | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)
    | (.name // .workflow // .description // "unnamed check")
  ]'

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --required --json name,bucket,state,workflow,description --jq "$jq_filter" >"$out_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
        cat "$out_file"
        rm -f "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
      cat "$out_file"
      rm -f "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

echo "=== AUTO-READY: scanning for green agent drafts ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    L: [.labels[].name],
    fail: []
  } ]')"

# Enrich with check failures for agent-owned drafts
ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    .draft
    and (.m == "MERGEABLE")
    and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Flip green agent drafts to ready
echo "=== FLIP: draft + agent + mergeable + 0 failing checks → ready ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft)
  | select(.m == "MERGEABLE")
  | select((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
  | select(.fail | length == 0)
  | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast") | not)' \
  | while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"

    # Idempotency guard (#13342): at most one attempt per PR per cooldown window.
    attempt_age_h="$(last_attempt_age_hours "$n")"
    if [[ -n "$attempt_age_h" && "$attempt_age_h" -lt "$ATTEMPT_COOLDOWN_HOURS" ]]; then
      echo "    ~ last attempt ${attempt_age_h}h ago (< ${ATTEMPT_COOLDOWN_HOURS}h cooldown); skipping"
      continue
    fi

    if ! mark_ready "$n"; then
      upsert_status_comment "$n" "⚠️ Auto-ready: all required checks are passing, but marking this PR ready for review **failed** (likely a token-permission gap — see #13122). A human needs to flip it to ready. Will retry in ${ATTEMPT_COOLDOWN_HOURS}h. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    [[ "$DRY_RUN" == "1" ]] && continue

    # Verify the flip actually landed before claiming enrollment — enrolling a
    # PR that is still a draft is a no-op and just spams the timeline.
    still_draft="$(is_still_draft "$n")"
    if [[ "$still_draft" == "false" ]]; then
      upsert_status_comment "$n" "🤖 Auto-ready: all required checks passing — marked ready for review and enrolling in merge queue. _(verified ready at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    else
      upsert_status_comment "$n" "⚠️ Auto-ready: \`gh pr ready\` reported success but the PR still shows draft=${still_draft} — the flip did not land (see #13122). A human needs to mark it ready. Will retry in ${ATTEMPT_COOLDOWN_HOURS}h. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
