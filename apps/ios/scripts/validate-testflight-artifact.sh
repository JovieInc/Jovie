#!/usr/bin/env bash
set -euo pipefail

# Validate the configuration that is actually embedded in the archive. Native
# auth no longer consumes a Clerk publishable key, so production artifacts must
# contain the canonical endpoints and must not retain that retired client key.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="${TESTFLIGHT_ARTIFACT_PLIST:-$IOS_DIR/Jovie/Configuration.local.plist}"

if [[ ! -f "$TARGET_PLIST" ]]; then
  echo "::error::Missing generated configuration artifact: $TARGET_PLIST (expected write-configuration.sh to run first)"
  exit 1
fi

api_base_url="$(plutil -extract ApiBaseUrl raw -o - "$TARGET_PLIST" 2>/dev/null || true)"
web_base_url="$(plutil -extract WebBaseUrl raw -o - "$TARGET_PLIST" 2>/dev/null || true)"
legacy_clerk_key="$(plutil -extract ClerkPublishableKey raw -o - "$TARGET_PLIST" 2>/dev/null || true)"

if [[ "$api_base_url" != "https://jov.ie" ]]; then
  echo "::error::Written TestFlight artifact has non-production ApiBaseUrl: ${api_base_url:-missing}"
  exit 1
fi
if [[ "$web_base_url" != "https://jov.ie" ]]; then
  echo "::error::Written TestFlight artifact has non-production WebBaseUrl: ${web_base_url:-missing}"
  exit 1
fi
if [[ -n "$legacy_clerk_key" ]]; then
  echo "::error::Written TestFlight artifact still embeds retired ClerkPublishableKey configuration."
  exit 1
fi

echo "Validated TestFlight configuration artifact: $TARGET_PLIST"
