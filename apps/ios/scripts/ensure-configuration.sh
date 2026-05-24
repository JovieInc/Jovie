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
WEB_BASE_URL="${WEB_BASE_URL:-${NEXT_PUBLIC_APP_URL:-https://jov.ie}}" \
  "$SCRIPT_DIR/write-configuration.sh"
