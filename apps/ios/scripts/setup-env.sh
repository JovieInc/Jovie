#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_PLIST="$IOS_DIR/Jovie/Configuration.local.plist"

CLERK_PUBLISHABLE_KEY="$(
  doppler run --project jovie-web --config dev -- \
    bash -lc 'printf %s "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"'
)"

WEB_BASE_URL="$(
  doppler run --project jovie-web --config dev -- \
    bash -lc 'printf %s "$NEXT_PUBLIC_APP_URL"'
)"

API_BASE_URL="${API_BASE_URL:-http://localhost:3100}"

python3 - <<PY
import plistlib
from pathlib import Path

target = Path(r"$TARGET_PLIST")
target.parent.mkdir(parents=True, exist_ok=True)

payload = {
    "ClerkPublishableKey": r"$CLERK_PUBLISHABLE_KEY",
    "ApiBaseUrl": r"$API_BASE_URL",
    "WebBaseUrl": r"$WEB_BASE_URL",
}

with target.open("wb") as fh:
    plistlib.dump(payload, fh, sort_keys=False)
PY

echo "Wrote $TARGET_PLIST"
