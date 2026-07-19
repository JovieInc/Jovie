#!/usr/bin/env bash
set -euo pipefail

is_blank() {
  local value="${1:-}"
  [[ -z "${value//[[:space:]]/}" ]]
}

required=(
  APPLE_API_KEY
  APPLE_API_KEY_ID
  APPLE_API_ISSUER
  APPLE_TEAM_ID
  MATCH_GIT_URL
  MATCH_PASSWORD
  CLERK_ASSOCIATED_DOMAIN
)

for key in "${required[@]}"; do
  if is_blank "${!key:-}"; then
    echo "::error::Missing required secret or env var: $key"
    exit 1
  fi
done

match_git_private_key="${MATCH_GIT_PRIVATE_KEY:-}"
match_git_basic_authorization="${MATCH_GIT_BASIC_AUTHORIZATION:-}"
if is_blank "$match_git_private_key" && is_blank "$match_git_basic_authorization"; then
  echo "::error::Missing match git authentication: set MATCH_GIT_PRIVATE_KEY or MATCH_GIT_BASIC_AUTHORIZATION"
  exit 1
fi

echo "Validated TestFlight release configuration."
