#!/usr/bin/env bash
set -euo pipefail

: "${NEON_API_KEY:?NEON_API_KEY is required}"
: "${NEON_PROJECT_ID:?NEON_PROJECT_ID is required}"
: "${BRANCH_NAME:?BRANCH_NAME is required}"
: "${ROLE_NAME:=neondb_owner}"

# Persist connection strings to the runner filesystem so callers can load them
# without re-interpolating secrets through ${{ }} expressions (which can strip
# or corrupt passwords that overlap registered GitHub secrets).
CONNECTION_DIR="${RUNNER_TEMP:-/tmp}/neon-connection"
mkdir -p "$CONNECTION_DIR"

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

set +e
CREATE_JSON="$(npx neonctl "${args[@]}" 2>&1)"
CREATE_EXIT=$?
set -e

BRANCH_ID=""
RESOLVED_BRANCH_NAME=""

if [ "$CREATE_EXIT" -eq 0 ]; then
  BRANCH_ID="$(echo "$CREATE_JSON" | jq -r '.branch.id // empty')"
  RESOLVED_BRANCH_NAME="$(echo "$CREATE_JSON" | jq -r '.branch.name // empty')"
else
  if echo "$CREATE_JSON" | grep -q 'branch already exists'; then
    echo "Reusing existing Neon branch: $BRANCH_NAME"
    RESOLVED_BRANCH_NAME="$BRANCH_NAME"
    BRANCHES_JSON="$(npx neonctl branches list \
      --project-id "$NEON_PROJECT_ID" \
      --api-key "$NEON_API_KEY" \
      --output json \
      --no-analytics \
      --no-color 2>/dev/null || echo "[]")"
    if ! echo "$BRANCHES_JSON" | jq -e . >/dev/null 2>&1; then
      BRANCHES_JSON="[]"
    fi
    BRANCH_ID="$(echo "$BRANCHES_JSON" | jq -r --arg name "$BRANCH_NAME" '
      (if type == "array" then . else (.branches // []) end)
      | .[]
      | select(.name == $name)
      | .id
    ' | head -1)"
  else
    echo "$CREATE_JSON"
    exit 1
  fi
fi

if [ -z "$RESOLVED_BRANCH_NAME" ]; then
  echo "Neon branch create response missing branch metadata."
  echo "$CREATE_JSON"
  exit 1
fi

if [ -z "$BRANCH_ID" ]; then
  echo "Warning: branch_id unavailable for $RESOLVED_BRANCH_NAME; continuing with connection strings."
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

# File-based handoff (authoritative for artifact consumers)
printf '%s' "$BRANCH_ID" > "$CONNECTION_DIR/branch_id"
printf '%s' "$RESOLVED_BRANCH_NAME" > "$CONNECTION_DIR/branch_name"
printf '%s' "$DB_URL" > "$CONNECTION_DIR/db_url"
printf '%s' "$DB_URL_POOLED" > "$CONNECTION_DIR/db_url_pooled"
jq -n \
  --arg db_url "$DB_URL" \
  --arg db_url_pooled "$DB_URL_POOLED" \
  --arg branch_id "$BRANCH_ID" \
  --arg branch_name "$RESOLVED_BRANCH_NAME" \
  '{
    db_url: $db_url,
    db_url_pooled: $db_url_pooled,
    branch_id: $branch_id,
    branch_name: $branch_name
  }' > "$CONNECTION_DIR/connection.json"

# Multiline GITHUB_OUTPUT avoids corruption when passwords contain special chars.
{
  echo "branch_id<<NEON_EOF"
  echo "$BRANCH_ID"
  echo "NEON_EOF"
  echo "db_url<<NEON_EOF"
  echo "$DB_URL"
  echo "NEON_EOF"
  echo "db_url_pooled<<NEON_EOF"
  echo "$DB_URL_POOLED"
  echo "NEON_EOF"
} >> "$GITHUB_OUTPUT"
