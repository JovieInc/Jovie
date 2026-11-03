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
#
# Visibility: the hold is announced as a ::notice on stderr and in
# GITHUB_STEP_SUMMARY; release-lineage-gate.sh re-prints the notice. It is
# metadata only: label, trigger status, wait, reset, bucket and quota counts.
# It never includes tokens, headers or URLs.
set -euo pipefail

budget="${GH_API_HOLD_BUDGET_SECONDS:-3900}"
token_cap="${GH_API_HOLD_TOKEN_CAP_SECONDS:-3900}"
if [ "$budget" -gt "$token_cap" ]; then
  budget="$token_cap"
fi

err="$(mktemp)"
out="$(mktemp)"
trap 'rm -f "$err" "$out"' EXIT

# A PATH shim that wraps this script must set GH_API_HOLD_BIN to the real
# gh binary. Otherwise the shim and this script call each other.
gh_bin="${GH_API_HOLD_BIN:-gh}"

invoke_gh() {
  local arg zip=0
  for arg in "$@"; do
    case "${arg%%\?*}" in
      */zip) zip=1 ;;
    esac
  done
  # gh 2.102 treats every GH_FORCE_TTY value, including 0, as a terminal and
  # refuses application/zip. Zip reads inherit a real file stdout. JSON reads
  # keep the caller's tty setting.
  if [ "$zip" -eq 1 ]; then
    env -u GH_FORCE_TTY "$gh_bin" "$@"
    return
  fi
  "$gh_bin" "$@"
}

run_gh() {
  : >"$err"
  : >"$out"
  set +e
  invoke_gh "$@" >"$out" 2>"$err"
  status=$?
  set -e
}

# Transient GitHub gateway failures (5xx, 408, network timeouts) can be
# retried with a bounded backoff when the caller opts in through
# GH_API_RETRY_ATTEMPTS (total attempts including the first). The default of
# 1 keeps the long-standing single-attempt behavior: callers that already
# loop around this script (desktop-release.yml, release-lineage-gate.sh)
# keep their own attempt budgets and call counts. Auth, permission,
# not-found and other non-transient 4xx responses are never retried here,
# and rate-limit responses fall through to the hold below, unchanged.
retry_attempts="${GH_API_RETRY_ATTEMPTS:-1}"
case "$retry_attempts" in
  *[!0-9]* | '') retry_attempts=1 ;;
esac
retry_base="${GH_API_RETRY_SECONDS:-2}"
case "$retry_base" in
  *[!0-9]* | '') retry_base=2 ;;
esac

attempt=1
run_gh "$@"
while [ "$status" -ne 0 ]; do
  message="$(cat "$err" "$out" 2>/dev/null || true)"
  if printf '%s\n' "$message" | grep -qiE 'API rate limit (already )?exceeded|x-ratelimit-remaining:[[:space:]]*0|secondary rate limit|HTTP 429'; then
    break
  fi
  if [ "$attempt" -ge "$retry_attempts" ] ||
    ! printf '%s\n' "$message" | grep -Eqi 'HTTP (408|5[0-9][0-9])|timed? out|timeout|error connecting|connection reset'; then
    cat "$err" >&2
    exit "$status"
  fi
  attempt=$((attempt + 1))
  retry_wait="$retry_base"
  if [ "$retry_wait" -gt 30 ]; then
    retry_wait=30
  fi
  echo "::warning::gh api attempt $attempt of $retry_attempts hit a transient failure; retrying in ${retry_wait}s." >&2
  sleep "$retry_wait"
  run_gh "$@"
done

if [ "$status" -eq 0 ]; then
  cat "$out"
  exit 0
fi

# GET /rate_limit does not spend the bucket it reports, including while that
# bucket is empty. The reset instant is x-ratelimit-reset for the core resource.
set +e
reset="$("$gh_bin" api rate_limit --jq '.resources.core.reset // empty' 2>/dev/null)"
reset_status=$?
set -e
now="$(date +%s)"
if [ "$reset_status" -ne 0 ] || ! [[ "$reset" =~ ^[0-9]+$ ]]; then
  echo "::error::GitHub rate limit response had no x-ratelimit-reset; refusing to continue." >&2
  cat "$err" >&2
  exit "$status"
fi
# Which resource ran dry, from the failing response's own x-ratelimit-resource
# header (core when the response carried none and rate_limit says core).
bucket="$(printf '%s\n' "$message" | grep -ioE 'x-ratelimit-resource:[[:space:]]*[A-Za-z_]+' | head -n1 | sed -E 's/^[^:]*:[[:space:]]*//' || true)"
bucket_src="x-ratelimit-resource"
if [ -z "$bucket" ]; then
  bucket="core"
  bucket_src="rate_limit.resources.core"
fi
# Unit tests drive this script with a fake gh (GH_API_HOLD_BIN) and mocked
# resets. Their lines carry [fixture] so nobody mistakes them for a live quota
# refusal (2026-10-25: two workers chased a mocked "resets at 1792938043").
tag=""
if [ -n "${GH_API_HOLD_BIN:-}" ] || [ "${GH_API_HOLD_FIXTURE:-}" = 1 ]; then
  tag="[fixture] "
fi
wait=$((reset - now + 1))
if [ "$wait" -lt 0 ]; then
  wait=0
fi
if [ "$wait" -gt "$budget" ]; then
  echo "::error::${tag}GitHub rate limit resets at ${reset} (resource=${bucket}), outside the ${budget}s budget. Not passing." >&2
  cat "$err" >&2
  exit "$status"
fi
echo "::warning::Holding ${wait}s for the GitHub rate limit reset." >&2
# Visibility only. Callers such as release-lineage-gate.sh capture this
# stderr and re-print the ::notice line, so it is kept to sanitized metadata
# (never tokens, headers or URLs). The summary is a plain file append.
trigger_http="$(printf '%s\n' "$message" | grep -oE 'HTTP [0-9]{3}' | head -n1 | cut -d' ' -f2 || true)"
label="${GH_API_HOLD_LABEL:-gh ${1:-} ${2:-}}"
label="${label%%\?*}"
label="$(printf '%s' "$label" | tr -c 'A-Za-z0-9 ._/@-' '_' | cut -c1-120)"
reset_iso="$(date -u -d "@${reset}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$reset" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
hold_fields="label=${label} http=${trigger_http:-unknown} wait_s=${wait} reset_epoch=${reset} reset_iso=${reset_iso} bucket=${bucket} bucket_source=${bucket_src}"
hdr_limit="$(printf '%s\n' "$message" | grep -ioE 'x-ratelimit-limit:[[:space:]]*[0-9]+' | head -n1 | grep -oE '[0-9]+$' || true)"
hdr_remaining="$(printf '%s\n' "$message" | grep -ioE 'x-ratelimit-remaining:[[:space:]]*[0-9]+' | head -n1 | grep -oE '[0-9]+$' || true)"
if [ -n "$hdr_limit" ]; then hold_fields="${hold_fields} limit=${hdr_limit}"; fi
if [ -n "$hdr_remaining" ]; then hold_fields="${hold_fields} remaining=${hdr_remaining}"; fi
echo "::notice title=GitHub API hold::${hold_fields}" >&2
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "- GitHub API hold: ${hold_fields}" >>"$GITHUB_STEP_SUMMARY" 2>/dev/null || true
fi
sleep "$wait"

run_gh "$@"
if [ "$status" -eq 0 ]; then
  cat "$out"
  exit 0
fi
cat "$err" >&2
exit "$status"
