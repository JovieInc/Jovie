#!/usr/bin/env bash
# Merge-queue stall watchdog.
#
# drain-pr-queue.sh (the enroll job) closes the *enrollment* gap: it makes
# sure clean PRs get the `merge-queue` label. It does not watch what happens
# to a PR once it is inside Graphite's queue. Measured stall data showed a
# p90 of 94 minutes and a max of 770 minutes between `merge-queue` label and
# actual merge, with no rescue mechanism for a PR that is clean, green, and
# enrolled but Graphite has stopped progressing on.
#
# This script looks only at PRs that already carry `merge-queue`, and acts
# on the ones that have been labeled longer than STALL_MINUTES:
#
#   - CONFLICTING / DIRTY        -> +needs-conflict-resolution (drain's next
#                                    pass owns removing merge-queue; we do not
#                                    remove it here to avoid racing drain).
#   - terminal red required check -> -merge-queue (same terminal-failure
#                                    definition as drain-pr-queue.sh: only
#                                    FAILURE/ERROR/TIMED_OUT/ACTION_REQUIRED/
#                                    STARTUP_FAILURE count; pending/queued/
#                                    cancelled do not).
#   - otherwise (clean + green + stuck) -> label-cycle merge-queue (remove,
#                                    re-add) to force Graphite to re-observe
#                                    the PR. Graphite is not the GitHub-native
#                                    merge queue, so there is no
#                                    `dequeuePullRequest` GraphQL mutation to
#                                    call — a label cycle is the only lever
#                                    available from the REST/GraphQL API.
#
# Anti-thrash: a hidden marker comment records the last kick time per PR.
# A PR is only kicked once per COOLDOWN_HOURS, regardless of how many times
# this script runs in that window.
#
# Env:
#   STALL_MINUTES   minutes a PR must have carried `merge-queue` before this
#                    script will act on it (default 45)
#   COOLDOWN_HOURS  minimum hours between label-cycle kicks for the same PR
#                    (default 2)
#   DRY_RUN=1       classify and print only; apply no labels/comments
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
STALL_MINUTES="${STALL_MINUTES:-45}"
COOLDOWN_HOURS="${COOLDOWN_HOURS:-2}"
KICK_MARKER="merge-queue-watchdog-kick"

now_epoch="$(date -u +%s)"

label() {  # label <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would +$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --add-label "$2" >/dev/null 2>&1 \
    && echo "    +$2 on #$1" || echo "    !! failed to add $2 on #$1"
}

unlabel() {  # unlabel <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would -$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --remove-label "$2" >/dev/null 2>&1 \
    && echo "    -$2 on #$1" || echo "    !! failed to remove $2 on #$1"
}

# Minutes since the most recent `merge-queue` label event on this PR, read
# from the issue timeline. Empty output means "could not determine" (treated
# as not-yet-stale so we never act on incomplete data).
label_age_minutes() {  # label_age_minutes <num>
  local n="$1"
  local labeled_at
  labeled_at="$(gh_retry api "repos/${REPO}/issues/${n}/timeline" --paginate \
    --jq '[.[] | select(.event=="labeled" and .label.name=="merge-queue") | .created_at] | last' \
    2>/dev/null || true)"
  [[ -z "$labeled_at" || "$labeled_at" == "null" ]] && { echo ""; return 0; }
  local labeled_epoch
  labeled_epoch="$(date -u -d "$labeled_at" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$labeled_at")"
  echo $(( (now_epoch - labeled_epoch) / 60 ))
}

# Hours since the last watchdog-kick marker comment on this PR. Empty output
# means "never kicked" (treated as cooldown-elapsed).
last_kick_age_hours() {  # last_kick_age_hours <num>
  local n="$1"
  local updated_at
  updated_at="$(gh_retry api "repos/${REPO}/issues/${n}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${KICK_MARKER} -->\")) | .updated_at] | last" \
    2>/dev/null || true)"
  [[ -z "$updated_at" || "$updated_at" == "null" ]] && { echo ""; return 0; }
  local updated_epoch
  updated_epoch="$(date -u -d "$updated_at" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$updated_at")"
  echo $(( (now_epoch - updated_epoch) / 3600 ))
}

record_kick() {  # record_kick <num> <body>
  local n="$1" body="$2"
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would record kick comment on #$n"; return 0; }
  bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$n" "$KICK_MARKER" "$body" \
    || echo "    !! failed to record kick comment on #$n"
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

  # Same terminal-failure definition as drain-pr-queue.sh: pending/queued/
  # cancelled required checks are NOT failures (see #11727 post-mortem).
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

echo "=== MERGE-QUEUE WATCHDOG: STALL_MINUTES=${STALL_MINUTES} COOLDOWN_HOURS=${COOLDOWN_HOURS} DRY_RUN=${DRY_RUN} ==="

CANDIDATES="$(gh_retry pr list -R "$REPO" --state open --limit 200 --label merge-queue \
  --json number,title,mergeable,mergeStateStatus,labels,headRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    L: [.labels[].name]
  } ]')"

total="$(jq 'length' <<<"$CANDIDATES")"
echo "  merge-queue-labeled PRs: ${total}"

kicked=0
conflicts=0
dequeued=0
skipped_fresh=0
skipped_cooldown=0

while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  t="$(jq -r '.t' <<<"$pr")"
  m="$(jq -r '.m' <<<"$pr")"
  ms="$(jq -r '.ms' <<<"$pr")"

  age_min="$(label_age_minutes "$n")"
  if [[ -z "$age_min" ]]; then
    echo "  #$n  $t  ?? could not determine label age; skipping"
    continue
  fi
  if [[ "$age_min" -lt "$STALL_MINUTES" ]]; then
    skipped_fresh=$((skipped_fresh + 1))
    continue
  fi

  if [[ "$m" != "MERGEABLE" || "$ms" == "CONFLICTING" || "$ms" == "DIRTY" ]]; then
    echo "  #$n  $t  CONFLICT (age=${age_min}m, mergeable=${m}, mergeStateStatus=${ms}) -> +needs-conflict-resolution"
    label "$n" needs-conflict-resolution
    conflicts=$((conflicts + 1))
    continue
  fi

  fail="$(check_failures_for_pr "$n")"
  if [[ "$(jq 'length' <<<"$fail")" -gt 0 ]]; then
    reason="$(jq -r 'join(", ")' <<<"$fail")"
    echo "  #$n  $t  RED (age=${age_min}m, checks=${reason}) -> -merge-queue"
    unlabel "$n" merge-queue
    dequeued=$((dequeued + 1))
    continue
  fi

  cooldown_age_h="$(last_kick_age_hours "$n")"
  if [[ -n "$cooldown_age_h" && "$cooldown_age_h" -lt "$COOLDOWN_HOURS" ]]; then
    echo "  #$n  $t  STALLED but in cooldown (last kick ${cooldown_age_h}h ago < ${COOLDOWN_HOURS}h) -> skip"
    skipped_cooldown=$((skipped_cooldown + 1))
    continue
  fi

  echo "  #$n  $t  STALLED (age=${age_min}m, clean+green) -> label-cycle merge-queue"
  unlabel "$n" merge-queue
  label "$n" merge-queue
  record_kick "$n" "Merge-queue watchdog: label-cycled \`merge-queue\` after ${age_min}m stalled with no terminal check failures (kicked at $(date -u +%Y-%m-%dT%H:%M:%SZ))."
  kicked=$((kicked + 1))
done < <(jq -c '.[]' <<<"$CANDIDATES")

echo "=== SUMMARY ==="
echo "  kicked (label-cycled): ${kicked}"
echo "  conflicts flagged: ${conflicts}"
echo "  dequeued (terminal red): ${dequeued}"
echo "  skipped (fresh, <${STALL_MINUTES}m): ${skipped_fresh}"
echo "  skipped (cooldown): ${skipped_cooldown}"
echo "=== done (DRY_RUN=$DRY_RUN) ==="
