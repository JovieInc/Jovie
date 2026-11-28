#!/usr/bin/env bash
set -euo pipefail
mkdir -p /tmp/neon-db-artifact
# Prefer the file written by neon-create-branch-with-retry (avoids
# re-interpolating DB passwords through GitHub expression expansion).
if [ -n "${CONNECTION_FILE:-}" ] && [ -f "$CONNECTION_FILE" ]; then
  cp "$CONNECTION_FILE" /tmp/neon-db-artifact/connection.json
elif [ -f "${RUNNER_TEMP:-/tmp}/neon-connection/connection.json" ]; then
  cp "${RUNNER_TEMP:-/tmp}/neon-connection/connection.json" /tmp/neon-db-artifact/connection.json
else
  echo "Neon connection file missing; cannot persist artifact."
  exit 1
fi
# Ensure branch_name is present for downstream diagnostics.
if [ -n "${BRANCH_NAME:-}" ]; then
  jq --arg branch_name "$BRANCH_NAME" '.branch_name = $branch_name' \
    /tmp/neon-db-artifact/connection.json > /tmp/neon-db-artifact/connection.json.tmp
  mv /tmp/neon-db-artifact/connection.json.tmp /tmp/neon-db-artifact/connection.json
fi
# Fail closed if password is missing from the artifact URL.
if ! jq -e '
  (.db_url // "" | test("^postgres(ql)?://[^:]+:[^@]+@")) and
  (.db_url_pooled // "" | test("^postgres(ql)?://[^:]+:[^@]+@"))
' /tmp/neon-db-artifact/connection.json >/dev/null; then
  echo "Neon connection artifact is missing username/password credentials."
  exit 1
fi
