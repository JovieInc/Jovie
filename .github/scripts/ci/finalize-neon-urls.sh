#!/usr/bin/env bash
set -euo pipefail
CONNECTION_FILE="${CONNECTION_FILE:-${RUNNER_TEMP:-/tmp}/neon-connection/connection.json}"
if [ ! -f "$CONNECTION_FILE" ]; then
  echo "Neon connection file missing after branch create: $CONNECTION_FILE"
  echo "This indicates NEON_PROJECT_ID/NEON_API_KEY or the create-branch action is failing."
  exit 1
fi
if ! jq -e '
  (.db_url // "" | length > 0) and
  (.db_url_pooled // "" | length > 0)
' "$CONNECTION_FILE" >/dev/null; then
  echo "Neon connection file is missing db_url/db_url_pooled."
  exit 1
fi
# Intentionally do NOT expose DB_URL via job outputs.
# GitHub will drop outputs that look like secrets, which breaks downstream jobs.
echo "Neon DB URL resolved for this job (file-backed)."
