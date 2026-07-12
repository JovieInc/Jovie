#!/usr/bin/env bash
set -euo pipefail

: "${GH_REPO:?GH_REPO is required}"
HEARTBEAT_WORKFLOW="${HEARTBEAT_WORKFLOW:-runner-heartbeat.yml}"
HEARTBEAT_MAX_AGE_SECONDS="${HEARTBEAT_MAX_AGE_SECONDS:-1500}"

if ! [[ "$HEARTBEAT_MAX_AGE_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "HEARTBEAT_MAX_AGE_SECONDS must be a positive integer" >&2
  exit 2
fi

api_error="$(mktemp)"
if ! LATEST=$(gh api \
  "repos/$GH_REPO/actions/workflows/$HEARTBEAT_WORKFLOW/runs?per_page=1" \
  --jq '.workflow_runs[0] | [.status, (.conclusion // ""), .created_at, .html_url] | @tsv' \
  2>"$api_error"); then
  echo "Runner heartbeat query failed; this is an authentication/API failure, not runner health." >&2
  cat "$api_error" >&2
  rm -f "$api_error"
  exit 3
fi
rm -f "$api_error"

if [[ -z "$LATEST" || "$LATEST" == "null\t\t\t" ]]; then
  HEALTH=down
  EVIDENCE="no runner heartbeat run exists"
else
  IFS=$'\t' read -r STATUS CONCLUSION CREATED_AT URL <<< "$LATEST"
  if [[ "$STATUS" == "completed" && "$CONCLUSION" == "success" ]]; then
    AGE_SECONDS=$(python3 - "$CREATED_AT" <<'PY'
import datetime
import sys

created = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
now = datetime.datetime.now(datetime.timezone.utc)
print(max(0, int((now - created).total_seconds())))
PY
)
    if [[ "$AGE_SECONDS" -le "$HEARTBEAT_MAX_AGE_SECONDS" ]]; then
      HEALTH=up
      EVIDENCE="latest heartbeat succeeded ${AGE_SECONDS}s ago at $CREATED_AT ($URL)"
    else
      HEALTH=down
      EVIDENCE="latest successful heartbeat is stale (${AGE_SECONDS}s > ${HEARTBEAT_MAX_AGE_SECONDS}s) at $CREATED_AT ($URL)"
    fi
  else
    HEALTH=down
    EVIDENCE="latest heartbeat is status=$STATUS conclusion=${CONCLUSION:-none} created=$CREATED_AT ($URL)"
  fi
fi

echo "Runner health: $HEALTH — $EVIDENCE"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "health=$HEALTH" >> "$GITHUB_OUTPUT"
  echo "evidence=$EVIDENCE" >> "$GITHUB_OUTPUT"
fi
