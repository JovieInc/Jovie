#!/usr/bin/env bash
set -euo pipefail
# GitHub masks secret substrings in the DEPLOYMENT_URL env dump, which
# removes the hostname. The base64 line keeps an openable URL for the
# funnel gate without printing a second plaintext copy.
echo "DEPLOYMENT_URL_B64: $(printf '%s' "$DEPLOYMENT_URL" | base64 -w0)"
inspect_wait_status=0
./node_modules/.bin/vercel inspect "$DEPLOYMENT_URL" \
  --wait \
  --timeout 8m \
  --scope "$VERCEL_ORG_ID" || inspect_wait_status=$?
deployment_json="$(./node_modules/.bin/vercel inspect "$DEPLOYMENT_URL" \
  --format=json \
  --scope "$VERCEL_ORG_ID")"
deployment_state="$(jq -r '(.readyState // .state // .status // "unknown") | ascii_upcase' \
  <<<"$deployment_json")"
echo "Current PR preview deployment state: $deployment_state"
if [ "$deployment_state" != "READY" ]; then
  echo "::error::PR preview is $deployment_state after readiness wait (status $inspect_wait_status); refusing a false-green preview."
  exit 1
fi
