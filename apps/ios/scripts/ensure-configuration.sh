#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="$IOS_DIR/Jovie/Configuration.local.plist"

if [[ -f "$TARGET_PLIST" ]]; then
  echo "Using existing $TARGET_PLIST"
  exit 0
fi

CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-pk_test_ci_placeholder}}" \
API_BASE_URL="${API_BASE_URL:-http://localhost:3100}" \
WEB_BASE_URL="${WEB_BASE_URL:-${API_BASE_URL:-http://localhost:3100}}" \
JOVIE_IOS_SENTRY_DSN="${JOVIE_IOS_SENTRY_DSN:-${NEXT_PUBLIC_SENTRY_DSN_DEV:-${NEXT_PUBLIC_SENTRY_DSN:-${SENTRY_DSN_DEV:-${SENTRY_DSN:-}}}}}" \
JOVIE_IOS_OBSERVABILITY_ENVIRONMENT="${JOVIE_IOS_OBSERVABILITY_ENVIRONMENT:-${OBSERVABILITY_ENVIRONMENT:-${SENTRY_ENVIRONMENT:-development}}}" \
  "$SCRIPT_DIR/write-configuration.sh"
