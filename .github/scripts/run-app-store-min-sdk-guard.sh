#!/usr/bin/env bash
# JOV-13089 workflow half: call the HA Flash companion if present, else fail closed.
set -euo pipefail
script="apps/ios/scripts/verify-app-store-min-sdk.mjs"
if [ ! -f "$script" ]; then
  echo "::error::Missing min-SDK guard script at $script (JOV-13089 HA Flash non-workflow half, PR #26026, is not yet merged). Refusing to upload."
  exit 1
fi
exec node "$script" "$@"
