#!/usr/bin/env bash

# Thin entry point. The collector lives in fetch-sonar-issues.mjs so it is
# unit-testable with a mocked HTTP layer (JOV-6245): real pagination driven by
# the API's paging metadata, supported partitioning at the 10k-result cap,
# branch pinning + analysis binding, classified failures with bounded retry,
# and fail-closed INCOMPLETE/non-atomic reporting.
#
# Env: SONAR_TOKEN (required), SONAR_PROJECT_KEY, SONAR_BRANCH, SONAR_BASE_URL.
# Exit: 0 complete+atomic, 1 failed (nothing written), 2 written but flagged.

set -euo pipefail

exec node "$(dirname "$0")/fetch-sonar-issues.mjs" "$@"
