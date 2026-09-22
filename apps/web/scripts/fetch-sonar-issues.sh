#!/usr/bin/env bash
# Entry point — collector lives in fetch-sonar-issues.mjs (mockable, testable).
set -euo pipefail
exec node "$(dirname "$0")/fetch-sonar-issues.mjs" "$@"
