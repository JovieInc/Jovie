#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CLERK_PUBLISHABLE_KEY="$(
  doppler run --project jovie-web --config dev -- \
    bash -lc 'printf %s "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"'
)"

WEB_BASE_URL="$(
  doppler run --project jovie-web --config dev -- \
    bash -lc 'printf %s "$NEXT_PUBLIC_APP_URL"'
)"

SENTRY_DSN="$(
  doppler run --project jovie-web --config dev -- \
    bash -lc 'printf %s "${NEXT_PUBLIC_SENTRY_DSN_DEV:-${NEXT_PUBLIC_SENTRY_DSN:-${SENTRY_DSN_DEV:-${SENTRY_DSN:-}}}}"'
)"

API_BASE_URL="${API_BASE_URL:-http://localhost:3100}"
OBSERVABILITY_ENVIRONMENT="${JOVIE_IOS_OBSERVABILITY_ENVIRONMENT:-${OBSERVABILITY_ENVIRONMENT:-development}}"

CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" \
API_BASE_URL="$API_BASE_URL" \
WEB_BASE_URL="$WEB_BASE_URL" \
JOVIE_IOS_SENTRY_DSN="$SENTRY_DSN" \
JOVIE_IOS_OBSERVABILITY_ENVIRONMENT="$OBSERVABILITY_ENVIRONMENT" \
  "$SCRIPT_DIR/write-configuration.sh"
