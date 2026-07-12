#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
GROUP_WAIT_SECONDS="${GROUP_WAIT_SECONDS:-300}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-7200}"
MARKER='graphite-zero-group-observer'
now_epoch="$(date -u +%s)"

iso_epoch() {
  date -u -d "$1" +%s 2>/dev/null || python3 -c \
    "import datetime,sys; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$1"
}

all_prs="$(gh api --paginate --slurp "repos/$REPO/pulls?state=open&per_page=100")"
groups="$(jq '[.[][] | select(.head.ref | startswith("gtmq_")) | {number, title}]' <<<"$all_prs")"
all_sources="$(jq '[.[][] | select((.head.ref | startswith("gtmq_")) | not) | {number, head: .head.sha, title, updated_at, draft, labels: [.labels[].name]}]' <<<"$all_prs")"
sources="$(jq '[.[] | select(.labels | index("merge-queue"))]' <<<"$all_sources")"

has_group() {
  local n="$1"
  jq -e --arg n "$n" 'any(.[].title; test("(PRs |, )" + $n + "(,|\\))"))' <<<"$groups" >/dev/null
}

last_observation_age() {
  local n="$1" updated
  updated="$(gh api --paginate --slurp "repos/$REPO/issues/$n/comments?per_page=100" \
    --jq "[.[][] | select(.body | contains(\"<!-- bot-comment:$MARKER -->\")) | .updated_at] | last" 2>/dev/null || true)"
  [[ -z "$updated" || "$updated" == "null" ]] && { echo ''; return; }
  echo $((now_epoch - $(iso_epoch "$updated")))
}

last_observation_body() {
  local n="$1"
  gh api --paginate --slurp "repos/$REPO/issues/$n/comments?per_page=100" \
    --jq "[.[][] | select(.body | contains(\"<!-- bot-comment:$MARKER -->\")) | .body] | last // \"\"" \
    2>/dev/null || true
}

record_observation() {
  local n="$1" body="$2"
  [[ "$DRY_RUN" == 1 ]] && { echo "[dry-run] would record #$n: $body"; return; }
  bash scripts/lib/upsert-pr-comment.sh "$n" "$MARKER" "$body"
}

# A synthetic group can recur even after a failing source is gated. That state
# must never be treated as a normal zero-group stall or repaired by label churn.
handle_recurring_group_source() {
  local group_n="$1" source_n="$2" source gated head terminal
  source="$(jq -c --argjson n "$source_n" '.[] | select(.number == $n)' <<<"$all_sources")"
  [[ -z "$source" ]] && return
  gated="$(jq -r '.labels | index("gated") != null' <<<"$source")"
  head="$(jq -r .head <<<"$source")"
  terminal="$(gh api --paginate --slurp "repos/$REPO/commits/$head/check-runs?per_page=100" | jq '[.[].check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required" or .conclusion == "startup_failure") | select((.name | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)] | length')"
  [[ "$gated" != true && "$terminal" -eq 0 ]] && return
  previous_observation="$(last_observation_body "$source_n")"
  if [[ "$(jq -r .draft <<<"$source")" == true && "$gated" == true && "$previous_observation" == *"Recurring synthetic group"* ]]; then
    echo "::error::synthetic #$group_n recurred again for draft+gated source #$source_n -> temporarily close source with reopen marker"
    if [[ "$DRY_RUN" != 1 ]]; then
      gh pr close "$source_n" -R "$REPO" --comment "<!-- graphite-reopen-after-blocking-train --> Graphite regenerated a synthetic group after this source was already held draft+gated. Temporarily closing the source to force internal dequeue. Reopen only after the blocking integration train recorded in the source coordination artifact has landed, then re-verify the exact head before enrollment."
      gh pr close "$group_n" -R "$REPO" --comment "Closing recurring Graphite synthetic group after first closing/dequeueing already draft+gated source #$source_n. Closing an accepted synthetic alone is not a reliable cancellation."
    fi
    record_observation "$source_n" "Repeated synthetic recurrence detected after the source was already held draft+gated. Source and synthetic group were temporarily closed fail-closed to force internal dequeue. Reopen only after the blocking integration train recorded in the coordination artifact has landed."
    return
  fi
  cooldown_age="$(last_observation_age "$source_n")"
  [[ -n "$cooldown_age" && "$cooldown_age" -lt "$COOLDOWN_SECONDS" ]] && return
  echo "::error::synthetic #$group_n recurred for gated/terminal-failing source #$source_n -> close/dequeue source before synthetic fail-closed"
  if [[ "$DRY_RUN" != 1 ]]; then
    [[ "$(jq -r .draft <<<"$source")" == true ]] || gh pr ready "$source_n" -R "$REPO" --undo
    gh pr edit "$source_n" -R "$REPO" --add-label gated
    gh pr close "$source_n" -R "$REPO" --comment "<!-- graphite-reopen-after-blocking-train --> Closing/dequeueing this gated or terminal-failing source before closing its synthetic group. Closing an accepted synthetic alone cannot reliably cancel an asynchronous Graphite merge. Reopen only after the blocking integration train recorded in the source coordination artifact has landed, then re-verify the exact head before enrollment."
    gh pr close "$group_n" -R "$REPO" --comment "Closing recurring Graphite synthetic group after first closing/dequeueing source #$source_n."
  fi
  record_observation "$source_n" "Recurring synthetic group #$group_n detected for a gated or terminal-failing source. Source was closed/dequeued before the synthetic group because closing an accepted synthetic alone is not reliable cancellation. Reopen only after the blocking integration train recorded in the coordination artifact has landed."
}

while IFS= read -r group; do
  group_n="$(jq -r .number <<<"$group")"
  title="$(jq -r .title <<<"$group")"
  [[ "$title" == *"PRs "* ]] || continue
  source_list="${title#*PRs }"
  source_list="${source_list%%)*}"
  while IFS= read -r source_n; do
    handle_recurring_group_source "$group_n" "$source_n"
  done < <(grep -oE '[0-9]+' <<<"$source_list")
done < <(jq -c '.[]' <<<"$groups")

while IFS= read -r source; do
  n="$(jq -r .number <<<"$source")"
  head="$(jq -r .head <<<"$source")"
  has_group "$n" && continue

  cooldown_age="$(last_observation_age "$n")"
  if [[ -n "$cooldown_age" && "$cooldown_age" -lt "$COOLDOWN_SECONDS" ]]; then
    echo "#$n zero-group observation is debounced (${cooldown_age}s < ${COOLDOWN_SECONDS}s)"
    continue
  fi

  checks="$(gh api --paginate --slurp "repos/$REPO/commits/$head/check-runs?per_page=100")"
  mergeability="$(jq '[.[].check_runs[] | select(.name == "Graphite / mergeability_check")] | sort_by(.started_at) | last // {}' <<<"$checks")"
  status="$(jq -r '.status // "missing"' <<<"$mergeability")"
  conclusion="$(jq -r '.conclusion // "missing"' <<<"$mergeability")"
  started="$(jq -r '.started_at // ""' <<<"$mergeability")"
  age=0
  [[ -n "$started" ]] && age=$((now_epoch - $(iso_epoch "$started")))

  gated="$(jq -r '.labels | index("gated") != null' <<<"$source")"
  draft="$(jq -r .draft <<<"$source")"
  terminal="$(jq '[.[].check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required" or .conclusion == "startup_failure") | select((.name | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)] | length' <<<"$checks")"
  if [[ "$gated" == true || "$draft" == true || "$terminal" -gt 0 || "$status" == missing || ( "$status" == completed && "$conclusion" != success ) ]]; then
    echo "::error::#$n is ineligible for zero-group recovery (gated=$gated draft=$draft terminal=$terminal mergeability=$status/$conclusion) -> dequeue fail-closed"
    if [[ "$DRY_RUN" != 1 ]]; then
      gh pr edit "$n" -R "$REPO" --remove-label merge-queue
    fi
    record_observation "$n" "Zero-group source was ineligible for recovery (gated=$gated, draft=$draft, terminal checks=$terminal, mergeability=$status/$conclusion). Removed merge-queue fail-closed; no re-enrollment was attempted."
    continue
  fi

  if [[ "$status" == in_progress && "$age" -ge "$GROUP_WAIT_SECONDS" ]]; then
    behind="$(gh api "repos/$REPO/compare/main...$head" --jq '.behind_by')"
    if [[ "$behind" -gt 0 ]]; then
      echo "#$n has stale Graphite mergeability (${age}s), zero group, and is ${behind} commits behind main -> targeted rebase dispatch"
      [[ "$DRY_RUN" == 1 ]] || gh workflow run auto-resolve-conflicts.yml -R "$REPO" -f pr_number="$n"
      record_observation "$n" "Stale Graphite mergeability with zero active group detected after ${age}s. Source is ${behind} commits behind main; dispatched targeted rebase/replant. No label cycle was performed."
    else
      echo "::error::#$n has stale Graphite mergeability (${age}s) with zero group but is already current; fail-closed escalation"
      record_observation "$n" "Stale Graphite mergeability with zero active group detected after ${age}s, but source is already current with main. Escalating fail closed; no rebase or label cycle was performed."
    fi
    continue
  fi

  # A queued or fresh in-progress mergeability check is active work, not a
  # zero-group stall. Only a terminal successful check is eligible to cycle.
  if [[ "$status" != completed || "$conclusion" != success ]]; then
    echo "#$n mergeability is still $status/$conclusion; zero-group recovery deferred"
    continue
  fi

  updated="$(jq -r .updated_at <<<"$source")"
  source_age=$((now_epoch - $(iso_epoch "$updated")))
  [[ "$source_age" -lt "$GROUP_WAIT_SECONDS" ]] && continue
  echo "#$n is clean-labeled with zero Graphite group for ${source_age}s -> single label cycle"
  if [[ "$DRY_RUN" != 1 ]]; then
    gh pr edit "$n" -R "$REPO" --remove-label merge-queue
    restored=0
    for attempt in 1 2 3; do
      if gh pr edit "$n" -R "$REPO" --add-label merge-queue; then
        restored=1
        break
      fi
      sleep "$attempt"
    done
    if [[ "$restored" -ne 1 ]]; then
      gh pr edit "$n" -R "$REPO" --add-label gated || true
      record_observation "$n" "Zero-group recovery removed merge-queue but failed to restore it after 3 attempts. Source was gated fail-closed for operator review."
      echo "::error::#$n merge-queue label restoration failed after 3 attempts; source gated fail-closed"
      continue
    fi
  fi
  record_observation "$n" "Clean labeled source had zero active Graphite groups for ${source_age}s; performed one safe merge-queue label cycle. Further recovery is debounced for ${COOLDOWN_SECONDS}s."
done < <(jq -c '.[]' <<<"$sources")
