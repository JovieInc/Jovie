#!/usr/bin/env bash
# Run pr-fleet-rules.mjs on the dedicated CI App token (falling back to
# github.token). The job result IS the verdict PR Ready reads (from this
# workflow's own runs, which only main's copy of this file can produce):
# success = fleet rules passed, 75 = deferred (quota/outage, never a pass),
# 1 = policy red. After a decisive verdict, the latest completed failed Source
# Validation run for this head is re-run so PR Ready re-reads it.
#
# No commit status is posted. It was informational (nothing read it) and it was
# written with github.token, so an empty repo-wide GITHUB_TOKEN bucket turned a
# verdict already read on the CI App budget into exit 75 (run 40164178818,
# 2026-10-25 05:07Z: "github-quota-deferred: gh api -X primary"). Every
# github.token call left here is best-effort and cannot change the verdict.
set -uo pipefail

# Every GitHub call goes through the enforced client layer (external-apis.md).
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }

[[ "${HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo '::error::exact head sha required'; exit 1; }
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

set +e
GITHUB_TOKEN="${FLEET_TOKEN:-$GH_TOKEN}" node scripts/pr-fleet-rules.mjs --with-warnings 2>&1 | tee "$out"
rc="${PIPESTATUS[0]}"

case "$rc" in
  0) state=success ;;
  75) state=error ;;
  *) state=failure ;;
esac

if [ "$state" != error ]; then
  run_id="$(ghx repair api "repos/$REPOSITORY/actions/workflows/source-validation.yml/runs?head_sha=$HEAD_SHA&event=pull_request&status=completed&per_page=10" \
    --jq '[.workflow_runs[] | select(.conclusion == "failure" and .run_attempt < 4)] | sort_by(.created_at) | last | .id // empty' 2>/dev/null || true)"
  [ -z "$run_id" ] || bash .github/scripts/fleet-rules-rerun.sh "$run_id" || true
fi
case "$state" in success) exit 0 ;; error) exit 75 ;; *) exit 1 ;; esac
