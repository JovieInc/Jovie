#!/usr/bin/env bash
# CI Health Check — single source of truth for PR pipeline state.
#
# Lists all open PRs with their state (number, title, draft/ready, mergeable,
# failing checks) and classifies each as one of:
#   ready-to-enroll  — non-draft, mergeable, 0 failing checks, not opted out
#   needs-ready-flip — draft, mergeable, 0 failing checks, agent-owned
#   needs-fix        — mergeable but has failing checks
#   needs-human      — has needs-human/hold/gated label
#   superseded       — merge conflict or unmergeable
#
# Also reports the count of orphaned drafts (green but still draft >24h).
#
# Usable both as a GitHub Actions workflow step and locally.
#
# Env:
#   REPO             target repo (default: JovieInc/Jovie)
#   DRY_RUN=1        no-op (for consistency with other scripts)
#   OUTPUT=json|text output format (default: text)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
OUTPUT="${OUTPUT:-text}"
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|dependabot/)'

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"

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
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

# Compute the 24h cutoff for orphaned draft detection
now_ms="$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')"
orphan_cutoff_ms=$((now_ms - 24 * 3600 * 1000))
orphan_cutoff_iso="$(date -u -d @$((orphan_cutoff_ms / 1000)) +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || python3 -c "import datetime; print(datetime.datetime.utcfromtimestamp($orphan_cutoff_ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ'))")"

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,updatedAt --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    updated: .updatedAt,
    L: [.labels[].name],
    fail: []
  } ]')"

# Enrich with check failures for all PRs
ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.m == "MERGEABLE")
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Classify each PR
CLASSIFIED="$(echo "$SNAP" | jq --arg re "$AGENT_RE" --arg cutoff "$orphan_cutoff_iso" '
  [.[] | . + {
    bucket: (
      if ([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated")) then "needs-human"
      elif .m == "CONFLICTING" then "superseded"
      elif .m != "MERGEABLE" then "superseded"
      elif .draft and ((.head | test($re)) and (.fail | length == 0) and ((.updated // "9999-01-01") < $cutoff)) then "needs-ready-flip"
      elif .draft and ((.head | test($re)) and (.fail | length == 0)) then "needs-ready-flip"
      elif .fail | length > 0 then "needs-fix"
      elif .draft then "needs-ready-flip"
      else "ready-to-enroll"
      end
    ),
    orphaned: (
      .draft and (.fail | length == 0) and ((.updated // "9999-01-01") < $cutoff)
    )
  }]
')"

# Output
if [[ "$OUTPUT" == "json" ]]; then
  echo "$CLASSIFIED" | jq .
else
  echo "=== CI HEALTH CHECK ==="
  echo ""

  for bucket in ready-to-enroll needs-ready-flip needs-fix needs-human superseded; do
    bucket_prs="$(echo "$CLASSIFIED" | jq -c --arg b "$bucket" '[.[] | select(.bucket == $b)]')"
    count="$(jq length <<<"$bucket_prs")"
    echo "--- $bucket ($count) ---"
    if [[ "$count" -eq 0 ]]; then
      echo "  (none)"
    else
      echo "$bucket_prs" | jq -r '.[] | "  #\(.n)  \(.t)  [\(.head)]  draft=\(.draft)  mergeable=\(.m)  fail=\(.fail)"'
    fi
    echo ""
  done

  orphaned_count="$(echo "$CLASSIFIED" | jq '[.[] | select(.orphaned)] | length')"
  echo "--- ORPHANED DRAFTS (green but still draft >24h): $orphaned_count ---"
  if [[ "$orphaned_count" -gt 0 ]]; then
    echo "$CLASSIFIED" | jq -r '[.[] | select(.orphaned)] | .[] | "  #\(.n)  \(.t)  updated=\(.updated)"'
  fi
  echo ""
  echo "=== done ==="
fi
