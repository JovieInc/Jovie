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
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
STALL_MINUTES="${STALL_MINUTES:-45}"
COOLDOWN_HOURS="${COOLDOWN_HOURS:-2}"
# Sanity cap (#13343): a stall longer than this is a data error (unset/epoch-0
# enqueue timestamp computing a ~56-year stall), never a real queue stall.
# Skip such PRs instead of kicking them.
MAX_STALL_MINUTES="${MAX_STALL_MINUTES:-10080}"  # 7 days
# Hard cap on label-cycle kicks per PR per UTC day, on top of COOLDOWN_HOURS.
MAX_KICKS_PER_DAY="${MAX_KICKS_PER_DAY:-4}"
KICK_MARKER="merge-queue-watchdog-kick"
# Timestamps before this are unset/zeroed data (epoch 0, Go zero time, etc.),
# not real label events. 2020-01-01T00:00:00Z.
MIN_VALID_EPOCH=1577836800

now_epoch="$(date -u +%s)"
today_utc="$(date -u +%Y-%m-%d)"

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
# from the issue timeline, echoed as "<minutes> <timestamp>". Empty output
# means "could not determine a valid timestamp" (treated as not-yet-stale so
# we never act on incomplete data).
#
# Null-safety (#13343): with --paginate the per-page jq filter can emit `null`
# lines (pages with no matching event) alongside a real timestamp, and the API
# can surface unset/zeroed timestamps. Naively parsing those computed stalls
# from epoch 0 (~29.7M minutes) and mass-kicked freshly-enrolled PRs. We now
# (a) keep only ISO-8601-shaped lines, (b) reject epochs before
# MIN_VALID_EPOCH, and (c) validate the parsed epoch is numeric.
label_age_minutes() {  # label_age_minutes <num>
  local n="$1"
  local labeled_at
  labeled_at="$(gh_retry api "repos/${REPO}/issues/${n}/timeline" --paginate \
    --jq '[.[] | select(.event=="labeled" and .label.name=="merge-queue") | .created_at] | last' \
    2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' | tail -n1 || true)"
  [[ -z "$labeled_at" || "$labeled_at" == "null" ]] && { echo ""; return 0; }
  local labeled_epoch
  labeled_epoch="$(date -u -d "$labeled_at" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$labeled_at" 2>/dev/null \
    || true)"
  if ! [[ "$labeled_epoch" =~ ^[0-9]+$ ]] || [[ "$labeled_epoch" -lt "$MIN_VALID_EPOCH" ]]; then
    echo ""
    return 0
  fi
  echo "$(( (now_epoch - labeled_epoch) / 60 )) ${labeled_at}"
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
  if bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$n" "$KICK_MARKER" "$body"; then
    echo "    recorded kick comment on #$n"
    return 0
  fi
  echo "    !! failed to record kick comment on #$n" >&2
  return 1
}

# A label cycle is a two-step mutation. Unlike the best-effort label helpers
# used for one-way classifications above, these helpers preserve failure so a
# removed queue label can always be compensated before the watchdog exits.
add_queue_label_strict() {  # add_queue_label_strict <num>
  local n="$1"
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would +merge-queue on #$n"; return 0; }
  if gh_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
    echo "    +merge-queue on #$n"
    return 0
  fi
  echo "    !! failed to add merge-queue on #$n" >&2
  return 1
}

remove_queue_label_strict() {  # remove_queue_label_strict <num>
  local n="$1"
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would -merge-queue on #$n"; return 0; }
  if gh_retry pr edit "$n" -R "$REPO" --remove-label merge-queue >/dev/null; then
    echo "    -merge-queue on #$n"
    return 0
  fi
  echo "    !! failed to remove merge-queue on #$n; queue membership is unchanged" >&2
  return 1
}

# Kicks recorded today (UTC) for this PR, parsed from the marker comment body
# ("kicks <YYYY-MM-DD>: <n>"). 0 when never kicked or last kick was another day.
kick_count_today() {  # kick_count_today <num>
  local n="$1" body count
  body="$(gh_retry api "repos/${REPO}/issues/${n}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${KICK_MARKER} -->\")) | .body] | last" \
    2>/dev/null || true)"
  [[ -z "$body" || "$body" == "null" ]] && { echo 0; return 0; }
  count="$(grep -oE "kicks ${today_utc}: [0-9]+" <<<"$body" | grep -oE '[0-9]+$' | tail -n1 || true)"
  echo "${count:-0}"
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
mutation_failures=0

while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  t="$(jq -r '.t' <<<"$pr")"
  m="$(jq -r '.m' <<<"$pr")"
  ms="$(jq -r '.ms' <<<"$pr")"

  age_out="$(label_age_minutes "$n")"
  if [[ -z "$age_out" ]]; then
    echo "  #$n  $t  ?? no valid merge-queue label timestamp; skipping (not kicking on incomplete data)"
    continue
  fi
  age_min="${age_out%% *}"
  labeled_at="${age_out#* }"
  if [[ "$age_min" -gt "$MAX_STALL_MINUTES" ]]; then
    echo "  #$n  $t  ?? computed stall ${age_min}m exceeds ${MAX_STALL_MINUTES}m sanity cap (timestamp source: ${labeled_at}); treating as data error and skipping"
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

  kicks_today="$(kick_count_today "$n")"
  if [[ "$kicks_today" -ge "$MAX_KICKS_PER_DAY" ]]; then
    echo "  #$n  $t  STALLED but already kicked ${kicks_today}x today (>= ${MAX_KICKS_PER_DAY}/day cap) -> skip"
    skipped_cooldown=$((skipped_cooldown + 1))
    continue
  fi

  echo "  #$n  $t  STALLED (age=${age_min}m, clean+green) -> label-cycle merge-queue"
  if ! remove_queue_label_strict "$n"; then
    mutation_failures=$((mutation_failures + 1))
    continue
  fi
  if ! add_queue_label_strict "$n"; then
    echo "    !! re-add failed; compensating by restoring merge-queue on #$n" >&2
    if ! add_queue_label_strict "$n"; then
      echo "    !! CRITICAL: compensation failed; #$n may be missing merge-queue" >&2
    fi
    mutation_failures=$((mutation_failures + 1))
    continue
  fi
  if ! record_kick "$n" "Merge-queue watchdog: label-cycled \`merge-queue\` after ${age_min}m stalled with no terminal check failures (kicked at $(date -u +%Y-%m-%dT%H:%M:%SZ)). Timestamp source: \`merge-queue\` labeled event at ${labeled_at} from the issue timeline. kicks ${today_utc}: $((kicks_today + 1))"; then
    echo "    !! comment failed; confirming merge-queue remains restored on #$n" >&2
    if ! add_queue_label_strict "$n"; then
      echo "    !! CRITICAL: label confirmation failed; #$n may be missing merge-queue" >&2
    fi
    mutation_failures=$((mutation_failures + 1))
    continue
  fi
  kicked=$((kicked + 1))
done < <(jq -c '.[]' <<<"$CANDIDATES")

echo "=== SUMMARY ==="
echo "  kicked (label-cycled): ${kicked}"
echo "  conflicts flagged: ${conflicts}"
echo "  dequeued (terminal red): ${dequeued}"
echo "  skipped (fresh, <${STALL_MINUTES}m): ${skipped_fresh}"
echo "  skipped (cooldown): ${skipped_cooldown}"
echo "  mutation failures: ${mutation_failures}"
echo "=== done (DRY_RUN=$DRY_RUN) ==="
[[ "$mutation_failures" -eq 0 ]]
