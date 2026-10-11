#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="${TARGET_PLIST:-$IOS_DIR/Jovie/Configuration.local.plist}"

API_BASE_URL="${API_BASE_URL:-http://localhost:3100}"
WEB_BASE_URL="${WEB_BASE_URL:-$API_BASE_URL}"
SENTRY_DSN="${JOVIE_IOS_SENTRY_DSN:-${NEXT_PUBLIC_SENTRY_DSN_DEV:-${NEXT_PUBLIC_SENTRY_DSN:-${SENTRY_DSN_DEV:-${SENTRY_DSN:-}}}}}"
OBSERVABILITY_ENVIRONMENT="${JOVIE_IOS_OBSERVABILITY_ENVIRONMENT:-${OBSERVABILITY_ENVIRONMENT:-${SENTRY_ENVIRONMENT:-development}}}"
OBSERVABILITY_INGEST_URL="${JOVIE_IOS_OBSERVABILITY_INGEST_URL:-${OBSERVABILITY_INGEST_URL:-}}"
OBSERVABILITY_INGEST_SECRET="${JOVIE_IOS_OBSERVABILITY_INGEST_SECRET:-${OBSERVABILITY_INGEST_SECRET:-}}"
# Release provenance: the exact commit baked into this artifact. TestFlight
# builds resolve it to the authorized release SHA via the checkout; local builds
# fall back to the worktree HEAD. Empty when no commit can be resolved.
GIT_COMMIT="${JOVIE_IOS_COMMIT_SHA:-$(git -C "$IOS_DIR" rev-parse HEAD 2>/dev/null || true)}"
mkdir -p "$(dirname "$TARGET_PLIST")"

# ponytail: use /usr/bin/plutil (always present on macOS) instead of python3 to
# avoid breakage from a broken Homebrew python on PATH (e.g. pyexpat/libexpat
# symbol mismatch with python@3.14).
/usr/bin/plutil -create xml1 "$TARGET_PLIST"
/usr/bin/plutil -insert ApiBaseUrl             -string "$API_BASE_URL"             "$TARGET_PLIST"
/usr/bin/plutil -insert WebBaseUrl             -string "$WEB_BASE_URL"             "$TARGET_PLIST"
/usr/bin/plutil -insert SentryDsn              -string "$SENTRY_DSN"               "$TARGET_PLIST"
/usr/bin/plutil -insert ObservabilityEnvironment -string "$OBSERVABILITY_ENVIRONMENT" "$TARGET_PLIST"
/usr/bin/plutil -insert ObservabilityIngestUrl -string "$OBSERVABILITY_INGEST_URL" "$TARGET_PLIST"
/usr/bin/plutil -insert ObservabilityIngestSecret -string "$OBSERVABILITY_INGEST_SECRET" "$TARGET_PLIST"
/usr/bin/plutil -insert GitCommit                -string "$GIT_COMMIT"                "$TARGET_PLIST"

echo "Wrote $TARGET_PLIST"
