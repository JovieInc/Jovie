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
  CLERK_PUBLISHABLE_KEY
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

case "$CLERK_PUBLISHABLE_KEY" in
  pk_live_*)
    ;;
  pk_test_ci_placeholder)
    echo "::error::CLERK_PUBLISHABLE_KEY is still set to the CI placeholder; TestFlight requires a production Clerk publishable key."
    exit 1
    ;;
  pk_test*)
    echo "::error::CLERK_PUBLISHABLE_KEY is a development Clerk key; TestFlight requires a production Clerk publishable key."
    exit 1
    ;;
  *)
    echo "::error::CLERK_PUBLISHABLE_KEY must start with pk_live_ for TestFlight distribution."
    exit 1
    ;;
esac

echo "Validated TestFlight release configuration."
