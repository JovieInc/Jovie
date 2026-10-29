#!/usr/bin/env bash
# Run pr-fleet-rules.mjs on the dedicated CI App token (falling back to
# github.token for the policy read only). The job result IS the verdict PR Ready reads (from this
# workflow's own runs, which only main's copy of this file can produce):
# success = fleet rules passed, 75 = deferred (quota/outage, never a pass),
# 1 = policy red. After a decisive verdict, the latest completed failed Source
# Validation run for this head is re-run so PR Ready re-reads it.
#
# No commit status is posted. It was informational (nothing read it) and it was
# written with github.token, so an empty repo-wide GITHUB_TOKEN bucket turned a
# verdict already read on the CI App budget into exit 75 (run 40164178818,
# 2026-10-25 05:07Z: the github-quota-deferred warning on the status POST). Every
# github.token call left here is best-effort and cannot change the verdict.
set -uo pipefail

# Every GitHub call goes through the enforced client layer (external-apis.md).
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }

[[ "${HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo '::error::exact head sha required'; exit 1; }
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

# A deferred read (75) is GitHub quota or an outage, never a verdict, and nothing
# wakes this job again, so PR Ready would stay red on it for good (2026-10-25:
# #22978, #23005, #23089). Retry in the job, with a growing pause, before giving up;
# the doctor's quota-deferred-heads alert covers whatever is still deferred after.
MAX_DEFERRED_RETRIES="${FLEET_DEFERRED_RETRIES:-3}"
BACKOFF_STEP_S="${FLEET_DEFERRED_BACKOFF_STEP_S:-20}"
BACKOFF_CAP_S="${FLEET_DEFERRED_BACKOFF_CAP_S:-80}"
# Each attempt may also hold inside the script; keep the sum under the job timeout.
export FLEET_RULES_QUOTA_HOLD_SECONDS="${FLEET_RULES_QUOTA_HOLD_SECONDS:-45}"
retry=0
set +e
while :; do
  GITHUB_TOKEN="${FLEET_TOKEN:-$GH_TOKEN}" node scripts/pr-fleet-rules.mjs --with-warnings 2>&1 | tee "$out"
  rc="${PIPESTATUS[0]}"
  { [ "$rc" = 75 ] && [ "$retry" -lt "$MAX_DEFERRED_RETRIES" ]; } || break
  retry=$((retry + 1))
  pause=$((BACKOFF_STEP_S * retry))
  [ "$pause" -le "$BACKOFF_CAP_S" ] || pause="$BACKOFF_CAP_S"
  echo "::notice::github-quota-deferred; fleet evidence retry $retry/$MAX_DEFERRED_RETRIES after ${pause}s."
  sleep "$pause"
done

case "$rc" in
  0) state=success ;;
  75) state=error ;;
  *) state=failure ;;
esac

# The read lookups below run on the CI App installation token (FLEET_TOKEN), never on
# github.token: the repo-wide GITHUB_TOKEN bucket was empty 79% of 02:23-03:23Z on
# 2026-10-26 and these lookups were where Fleet Rules deferred (exit 75) after a
# verdict had already been read on the App budget. Without an App token they are
# skipped (the workflow_run hop re-runs PR Ready once the verdict exists). Only the
# rerun POST, which needs actions:write, uses github.token.
if [ "$state" != error ] && [ -n "${FLEET_TOKEN:-}" ]; then
  run_id="$(GH_TOKEN="$FLEET_TOKEN" ghx repair api "repos/$REPOSITORY/actions/workflows/source-validation.yml/runs?head_sha=$HEAD_SHA&event=pull_request&status=completed&per_page=10" \
    --jq '[.workflow_runs[] | select(.conclusion == "failure" and .run_attempt < 4)] | sort_by(.created_at) | last | .id // empty' 2>/dev/null || true)"
  [ -z "$run_id" ] || GH_READ_TOKEN="$FLEET_TOKEN" bash .github/scripts/fleet-rules-rerun.sh "$run_id" || true
elif [ "$state" != error ]; then
  echo "::notice::No CI App token; skipping the Source Validation re-run lookup (the re-run hop covers it)."
fi
case "$state" in success) exit 0 ;; error) exit 75 ;; *) exit 1 ;; esac
