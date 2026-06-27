#!/usr/bin/env bash
set -euo pipefail

: "${NEON_API_KEY:?NEON_API_KEY is required}"
: "${NEON_PROJECT_ID:?NEON_PROJECT_ID is required}"
: "${BRANCH_NAME:?BRANCH_NAME is required}"
: "${ROLE_NAME:=neondb_owner}"

args=(
  branches create
  --project-id "$NEON_PROJECT_ID"
  --api-key "$NEON_API_KEY"
  --name "$BRANCH_NAME"
  --output json
  --no-analytics
  --no-color
)

if [ -n "${PARENT_BRANCH:-}" ]; then
  args+=(--parent "$PARENT_BRANCH")
fi

if [ -n "${EXPIRES_AT:-}" ]; then
  args+=(--expires-at "$EXPIRES_AT")
fi

CREATE_JSON="$(npx neonctl "${args[@]}")"
BRANCH_ID="$(echo "$CREATE_JSON" | jq -r '.branch.id // empty')"
RESOLVED_BRANCH_NAME="$(echo "$CREATE_JSON" | jq -r '.branch.name // empty')"

if [ -z "$BRANCH_ID" ] || [ -z "$RESOLVED_BRANCH_NAME" ]; then
  echo "Neon branch create response missing branch metadata."
  echo "$CREATE_JSON"
  exit 1
fi

DB_URL="$(npx neonctl connection-string "$RESOLVED_BRANCH_NAME" \
  --project-id "$NEON_PROJECT_ID" \
  --api-key "$NEON_API_KEY" \
  --role-name "$ROLE_NAME" \
  --database-name neondb \
  --no-analytics \
  --no-color | tr -d '\n')"

DB_URL_POOLED="$(npx neonctl connection-string "$RESOLVED_BRANCH_NAME" \
  --project-id "$NEON_PROJECT_ID" \
  --api-key "$NEON_API_KEY" \
  --role-name "$ROLE_NAME" \
  --database-name neondb \
  --pooled \
  --no-analytics \
  --no-color | tr -d '\n')"

if [ -z "$DB_URL" ] || [ -z "$DB_URL_POOLED" ]; then
  echo "Neon branch created but connection strings were empty."
  exit 1
fi

{
  echo "branch_id=$BRANCH_ID"
  echo "db_url=$DB_URL"
  echo "db_url_pooled=$DB_URL_POOLED"
} >> "$GITHUB_OUTPUT"