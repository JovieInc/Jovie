#!/usr/bin/env bash
set -euo pipefail

# Guards against env-vs-artifact drift for TestFlight distribution.
#
# validate-testflight-env.sh checks $CLERK_PUBLISHABLE_KEY (and other env vars)
# BEFORE `fastlane ios beta` runs. But the actual shipped artifact is
# Configuration.local.plist, written later by write-configuration.sh via its
# own independent env fallback chain. ensure-configuration.sh also skips
# writing entirely if a Configuration.local.plist already exists on disk, so
# a stale cached plist from a prior local run would never be touched or
# re-validated by the env-var check alone.
#
# This script re-validates the key that actually landed in the WRITTEN
# artifact, after write-configuration.sh has run and before the archive/
# upload steps execute.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="${TESTFLIGHT_ARTIFACT_PLIST:-$IOS_DIR/Jovie/Configuration.local.plist}"

if [[ ! -f "$TARGET_PLIST" ]]; then
  echo "::error::Missing generated configuration artifact: $TARGET_PLIST (expected write-configuration.sh to run first)"
  exit 1
fi

clerk_publishable_key="$(plutil -extract ClerkPublishableKey raw -o - "$TARGET_PLIST" 2>/dev/null || true)"

if [[ -z "$clerk_publishable_key" ]]; then
  echo "::error::Written configuration artifact $TARGET_PLIST has no ClerkPublishableKey value"
  exit 1
fi

case "$clerk_publishable_key" in
  pk_live_*)
    ;;
  pk_test_ci_placeholder)
    echo "::error::Written configuration artifact embeds the CI placeholder Clerk key; TestFlight requires a production Clerk publishable key. This usually means a stale Configuration.local.plist was reused (ensure-configuration.sh skips writing when the file already exists)."
    exit 1
    ;;
  pk_test*)
    echo "::error::Written configuration artifact embeds a development Clerk key; TestFlight requires a production Clerk publishable key."
    exit 1
    ;;
  *)
    echo "::error::Written configuration artifact's ClerkPublishableKey must start with pk_live_ for TestFlight distribution."
    exit 1
    ;;
esac

echo "Validated TestFlight configuration artifact: $TARGET_PLIST"
