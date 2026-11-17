#!/usr/bin/env bash
# Bounded re-read of the canonical staging identity.
#
# staging.jov.ie serves a transient build-info body while a staging redeploy
# is in flight (PC run 43885460226, 2026-11-16 14:25Z: a single 200 response
# with a shape-invalid body failed staging admission about ten minutes before
# the same endpoint returned the well-formed e6a39734 identity). A one-shot
# read therefore turned an alias flap into a hard controller red.
#
# This reader retries a transport- or shape-unusable response a bounded
# number of times and fails closed when the identity stays malformed: a
# persistently malformed identity must still fail red. The body itself never
# reaches the log; attempts are classified and counted only.
set -euo pipefail

url="${STAGING_IDENTITY_URL:-https://staging.jov.ie/api/health/build-info}"
attempts="${STAGING_IDENTITY_ATTEMPTS:-4}"
backoff="${STAGING_IDENTITY_BACKOFF_SECONDS:-5}"

[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || {
  echo "::error::staging-identity-read needs a positive STAGING_IDENTITY_ATTEMPTS." >&2
  exit 1
}
[[ "$backoff" =~ ^[0-9]+$ ]] || {
  echo "::error::staging-identity-read needs a numeric STAGING_IDENTITY_BACKOFF_SECONDS." >&2
  exit 1
}

attempt=1
rc=0
while :; do
  reason="transport failure"
  rc=0
  if body="$(curl --fail --silent --show-error --connect-timeout 5 --max-time 20 "$url" 2>/dev/null)"; then
    if jq -e '(.commitSha | type == "string" and test("^[0-9a-f]{40}$")) and
              (.deploymentId | type == "string" and test("^dpl_[A-Za-z0-9]+$")) and
              .environment == "preview"' >/dev/null 2>&1 <<<"$body"; then
      printf '%s' "$body"
      exit 0
    fi
    reason="malformed shape"
  else
    rc=$?
  fi
  if [ "$attempt" -ge "$attempts" ]; then
    echo "::error::canonical staging identity stayed unusable ($reason) after $attempt/$attempts attempts; inspect $url before staging admission." >&2
    if [ "$rc" -ne 0 ]; then
      # Propagate the transport exit code: callers and tests treat an
      # unreachable alias as the transport fault it is.
      exit "$rc"
    fi
    exit 1
  fi
  echo "::warning::canonical staging identity attempt $attempt/$attempts unusable ($reason); re-reading in ${backoff}s." >&2
  sleep "$backoff"
  attempt=$((attempt + 1))
done
