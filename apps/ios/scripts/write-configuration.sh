#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="$IOS_DIR/Jovie/Configuration.local.plist"

CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-pk_test_ci_placeholder}}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3100}"
WEB_BASE_URL="${WEB_BASE_URL:-${NEXT_PUBLIC_APP_URL:-https://jov.ie}}"
SENTRY_DSN="${JOVIE_IOS_SENTRY_DSN:-${NEXT_PUBLIC_SENTRY_DSN_DEV:-${NEXT_PUBLIC_SENTRY_DSN:-${SENTRY_DSN_DEV:-${SENTRY_DSN:-}}}}}"
OBSERVABILITY_ENVIRONMENT="${JOVIE_IOS_OBSERVABILITY_ENVIRONMENT:-${OBSERVABILITY_ENVIRONMENT:-${SENTRY_ENVIRONMENT:-development}}}"

python3 - <<PY
import plistlib
from pathlib import Path

target = Path(r"$TARGET_PLIST")
target.parent.mkdir(parents=True, exist_ok=True)

payload = {
    "ClerkPublishableKey": r"$CLERK_PUBLISHABLE_KEY",
    "ApiBaseUrl": r"$API_BASE_URL",
    "WebBaseUrl": r"$WEB_BASE_URL",
    "SentryDsn": r"$SENTRY_DSN",
    "ObservabilityEnvironment": r"$OBSERVABILITY_ENVIRONMENT",
}

with target.open("wb") as file_handle:
    plistlib.dump(payload, file_handle, sort_keys=False)
PY

echo "Wrote $TARGET_PLIST"
