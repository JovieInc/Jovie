#!/usr/bin/env bash
set -uo pipefail

: "${GH_REPO:?GH_REPO is required}"
HEARTBEAT_WORKFLOW="${HEARTBEAT_WORKFLOW:-runner-heartbeat.yml}"
HEARTBEAT_MAX_AGE_SECONDS="${HEARTBEAT_MAX_AGE_SECONDS:-1500}"
HEARTBEAT_API_TIMEOUT_SECONDS="${HEARTBEAT_API_TIMEOUT_SECONDS:-20}"

emit_health() {
  local health="$1"
  local evidence="$2"
  echo "Runner health: $health — $evidence"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "health=$health" >> "$GITHUB_OUTPUT"
    echo "evidence=$evidence" >> "$GITHUB_OUTPUT"
  fi
}

degrade() {
  emit_health down "$1"
  exit 0
}

if ! [[ "$GH_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  degrade "repository identity is malformed"
fi
if [[ "$HEARTBEAT_WORKFLOW" != "runner-heartbeat.yml" ]]; then
  degrade "heartbeat workflow identity is not authorized"
fi
if ! [[ "$HEARTBEAT_MAX_AGE_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  degrade "heartbeat freshness boundary is malformed"
fi
if ! [[ "$HEARTBEAT_API_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  degrade "heartbeat API timeout is malformed"
fi

# Fail closed to hosted capacity on every API, schema, identity, or freshness
# uncertainty. Never echo raw API responses or credentials into evidence.
if ! runs_json="$(timeout "${HEARTBEAT_API_TIMEOUT_SECONDS}s" gh api \
  "repos/$GH_REPO/actions/workflows/$HEARTBEAT_WORKFLOW/runs?branch=main&per_page=1" \
  2>/dev/null)"; then
  degrade "heartbeat Actions API is unavailable"
fi
if ! jq -e '
  type == "object" and
  (.workflow_runs | type == "array") and
  (.workflow_runs | length <= 1)
' >/dev/null <<<"$runs_json"; then
  degrade "heartbeat run evidence is malformed or ambiguous"
fi
run_count="$(jq '.workflow_runs | length' <<<"$runs_json")"
if [[ "$run_count" != "1" ]]; then
  degrade "no exact heartbeat run exists"
fi

run_record="$(jq -c '.workflow_runs[0]' <<<"$runs_json")"
if ! jq -e --arg repo "$GH_REPO" '
  type == "object" and
  (.id | type == "number" and . > 0) and
  (.run_attempt | type == "number" and . > 0) and
  .name == "Runner Heartbeat" and
  .path == ".github/workflows/runner-heartbeat.yml" and
  .head_branch == "main" and
  .head_repository.full_name == $repo and
  (.head_sha | type == "string" and test("^[0-9a-f]{40}$")) and
  (.event == "schedule" or .event == "workflow_dispatch") and
  (.status | type == "string") and
  ((.conclusion // "") | type == "string") and
  (.updated_at | type == "string") and
  (.html_url | type == "string")
' >/dev/null <<<"$run_record"; then
  degrade "latest heartbeat run identity is malformed or unauthorized"
fi

run_id="$(jq -r '.id' <<<"$run_record")"
run_attempt="$(jq -r '.run_attempt' <<<"$run_record")"
head_sha="$(jq -r '.head_sha' <<<"$run_record")"
status="$(jq -r '.status' <<<"$run_record")"
conclusion="$(jq -r '.conclusion // ""' <<<"$run_record")"
observed_at="$(jq -r '.updated_at' <<<"$run_record")"
run_url="$(jq -r '.html_url' <<<"$run_record")"
if [[ "$run_url" != "https://github.com/$GH_REPO/actions/runs/$run_id" ]]; then
  degrade "latest heartbeat run URL is malformed"
fi
if [[ "$status" != "completed" || "$conclusion" != "success" ]]; then
  degrade "latest exact heartbeat is not a completed success"
fi

if ! jobs_json="$(timeout "${HEARTBEAT_API_TIMEOUT_SECONDS}s" gh api \
  --paginate --slurp \
  "repos/$GH_REPO/actions/runs/$run_id/attempts/$run_attempt/jobs?per_page=100" \
  2>/dev/null)"; then
  degrade "exact heartbeat job API is unavailable"
fi
if ! jq -e '
  type == "array" and length > 0 and
  all(.[]; type == "object" and (.jobs | type == "array"))
' >/dev/null <<<"$jobs_json"; then
  degrade "exact heartbeat job evidence is malformed"
fi
heartbeat_jobs="$(jq -c '
  [
    .[] | .jobs[]? |
    select(.name == "Self-hosted runner heartbeat")
  ] | unique_by(.id)
' <<<"$jobs_json")"
if ! jq -e --argjson run_id "$run_id" --arg head_sha "$head_sha" '
  length == 1 and
  (.[0].id | type == "number" and . > 0) and
  .[0].run_id == $run_id and
  .[0].head_sha == $head_sha and
  .[0].status == "completed" and
  .[0].conclusion == "success" and
  (.[0].runner_id | type == "number" and . > 0) and
  (.[0].runner_name | type == "string" and length > 0) and
  (.[0].labels | type == "array" and index("jovie-runner") != null)
' >/dev/null <<<"$heartbeat_jobs"; then
  degrade "exact heartbeat job did not complete successfully"
fi

if ! age_seconds="$(python3 - "$observed_at" <<'PY'
import datetime
import sys

observed = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
now = datetime.datetime.now(datetime.timezone.utc)
age = int((now - observed).total_seconds())
if age < 0:
    raise ValueError("heartbeat timestamp is in the future")
print(age)
PY
)"; then
  degrade "heartbeat timestamp could not be parsed"
fi
if ! [[ "$age_seconds" =~ ^[0-9]+$ ]]; then
  degrade "heartbeat age is malformed"
fi
if (( age_seconds > HEARTBEAT_MAX_AGE_SECONDS )); then
  degrade "latest exact heartbeat is stale (${age_seconds}s > ${HEARTBEAT_MAX_AGE_SECONDS}s)"
fi

emit_health up "exact heartbeat run $run_id attempt $run_attempt succeeded ${age_seconds}s ago ($run_url)"
