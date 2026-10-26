#!/usr/bin/env bash
# Map a desktop publisher installation-quota defer onto the workflow.
#
# scripts/desktop-release-assets.mjs exits 75 (EX_TEMPFAIL) only after it has
# written ::warning::, the step summary, and $RUNNER_TEMP/desktop-publish-quota-defer.
# The first attempt turns that into step success so the waiter can re-run the
# generation after the reset. DESKTOP_QUOTA_RETRY=1 keeps the second defer a
# failure. Every other status, including a 75 without the sentinel, is passed
# through. This does not sleep and does not change the 600s publisher budget.
set -euo pipefail

status="${1:-}"
[[ "$status" =~ ^[0-9]+$ ]] || {
  echo "::error::Desktop publisher status is malformed." >&2
  exit 1
}
if [ "$status" -ne 75 ]; then
  exit "$status"
fi

if [ "${DESKTOP_QUOTA_RETRY:-}" = 1 ]; then
  echo "::error::Desktop publication of ${RELEASE_SHA:-} deferred again after the quota retry. Not passing." >&2
  exit 75
fi

sentinel="${RUNNER_TEMP:-}/desktop-publish-quota-defer"
if [ ! -f "$sentinel" ]; then
  echo "::error::Desktop publisher exited 75 without an installation-quota defer sentinel." >&2
  exit 75
fi
reset_epoch="$(head -n 1 "$sentinel" | tr -d '[:space:]')"
[[ "$reset_epoch" =~ ^[0-9]+$ ]] || {
  echo "::error::Installation quota defer sentinel is malformed." >&2
  exit 75
}
if [ -z "${GITHUB_OUTPUT:-}" ]; then
  echo "::error::Desktop quota defer has no GITHUB_OUTPUT." >&2
  exit 75
fi

echo "quota_deferred=true" >> "$GITHUB_OUTPUT"
echo "quota_reset_epoch=$reset_epoch" >> "$GITHUB_OUTPUT"
exit 0
