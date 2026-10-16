#!/usr/bin/env bash
# Run `gh "$@"` and, only for a GitHub rate-limit response, hold until
# x-ratelimit-reset when that instant is inside the budget.
#
# The budget is the smaller of GH_API_HOLD_BUDGET_SECONDS and
# GH_API_HOLD_TOKEN_CAP_SECONDS. Both default to 3900s: a primary
# installation window (60 minutes) plus five minutes of slack. The Actions
# GITHUB_TOKEN lasts the hosted job, so the retry after that wait still
# authenticates. A job shorter than 65 minutes must set
# GH_API_HOLD_BUDGET_SECONDS below its timeout (resolve-main-sha.sh keeps
# its own 90s default for five-minute jobs).
# A reset outside the window exits non-zero. A non-rate-limit error exits
# non-zero. Exit 0 happens only after `gh` itself succeeds, so a 403 never
# passes as an empty result.
set -euo pipefail

budget="${GH_API_HOLD_BUDGET_SECONDS:-3900}"
token_cap="${GH_API_HOLD_TOKEN_CAP_SECONDS:-3900}"
if [ "$budget" -gt "$token_cap" ]; then
  budget="$token_cap"
fi

err="$(mktemp)"
out="$(mktemp)"
trap 'rm -f "$err" "$out"' EXIT

run_gh() {
  : >"$err"
  : >"$out"
  set +e
  gh "$@" >"$out" 2>"$err"
  status=$?
  set -e
}

run_gh "$@"
if [ "$status" -eq 0 ]; then
  cat "$out"
  exit 0
fi

message="$(cat "$err" "$out" 2>/dev/null || true)"
if ! printf '%s\n' "$message" | grep -qiE 'API rate limit (already )?exceeded|x-ratelimit-remaining:[[:space:]]*0|secondary rate limit|HTTP 429'; then
  cat "$err" >&2
  exit "$status"
fi

# GET /rate_limit does not spend the bucket it reports, including while that
# bucket is empty. The reset instant is x-ratelimit-reset for the core resource.
set +e
reset="$(gh api rate_limit --jq '.resources.core.reset // empty' 2>/dev/null)"
reset_status=$?
set -e
now="$(date +%s)"
if [ "$reset_status" -ne 0 ] || ! [[ "$reset" =~ ^[0-9]+$ ]]; then
  echo "::error::GitHub rate limit response had no x-ratelimit-reset; refusing to continue." >&2
  cat "$err" >&2
  exit "$status"
fi
wait=$((reset - now + 1))
if [ "$wait" -lt 0 ]; then
  wait=0
fi
if [ "$wait" -gt "$budget" ]; then
  echo "::error::GitHub rate limit resets at ${reset}, outside the ${budget}s budget. Not passing." >&2
  cat "$err" >&2
  exit "$status"
fi
echo "::warning::Holding ${wait}s for the GitHub rate limit reset." >&2
sleep "$wait"

run_gh "$@"
if [ "$status" -eq 0 ]; then
  cat "$out"
  exit 0
fi
cat "$err" >&2
exit "$status"
