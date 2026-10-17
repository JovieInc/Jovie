#!/usr/bin/env bash
# Print the current refs/heads/main SHA.
#
# The git protocol does not spend the shared GitHub App installation REST
# quota. Production Controller steps that used GET /commits/main failed closed
# on that 403 (2026-10-15, runs 38776000485 and 38777726530) and never wrote
# the verified marker. ls-remote is the read. If it fails, one REST read may
# hold until x-ratelimit-reset when that instant is inside
# RESOLVE_MAIN_BUDGET_SECONDS. An unreadable main exits 1. This script never
# prints a guessed SHA.
set -euo pipefail

repository="${1:-${REPOSITORY:-${GITHUB_REPOSITORY:-}}}"
[[ "$repository" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]] || {
  echo "::error::resolve-main-sha: repository must be owner/name." >&2
  exit 1
}

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
retry_sleep="${RESOLVE_MAIN_RETRY_SECONDS:-2}"
budget="${RESOLVE_MAIN_BUDGET_SECONDS:-90}"
url="https://github.com/${repository}.git"

ls_remote_main() {
  if [ -n "$token" ]; then
    GIT_CONFIG_COUNT=2 \
      GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
      GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')" \
      GIT_CONFIG_KEY_1=core.hooksPath \
      GIT_CONFIG_VALUE_1=/dev/null \
      GIT_TERMINAL_PROMPT=0 \
      GCM_INTERACTIVE=never \
      git ls-remote --refs "$url" refs/heads/main
    return
  fi
  GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never \
    git ls-remote --refs "$url" refs/heads/main
}

valid_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]
}

sha=""
attempt=1
while [ "$attempt" -le 3 ]; do
  line="$(ls_remote_main 2>/dev/null || true)"
  sha="${line%%[!0-9a-f]*}"
  if valid_sha "$sha"; then
    printf '%s\n' "$sha"
    exit 0
  fi
  if [ "$attempt" -lt 3 ]; then
    sleep "$retry_sleep"
  fi
  attempt=$((attempt + 1))
done

if ! command -v gh >/dev/null 2>&1 || [ -z "$token" ]; then
  echo "::error::Could not resolve refs/heads/main for ${repository} via git ls-remote." >&2
  exit 1
fi

# gh exits non-zero on a 403 but still prints the status line with -i.
rest_once() {
  gh api -i "repos/${repository}/commits/main" 2>/dev/null || true
}

for _rest_attempt in 1 2; do
  response="$(rest_once)"
  status="$(printf '%s\n' "$response" | awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { gsub("\r","",code); print code }')"
  reset="$(printf '%s\n' "$response" | awk 'tolower($1)=="x-ratelimit-reset:" { gsub("\r","",$2); print $2; exit }')"
  remaining="$(printf '%s\n' "$response" | awk 'tolower($1)=="x-ratelimit-remaining:" { gsub("\r","",$2); print $2; exit }')"
  body="$(printf '%s\n' "$response" | awk 'BEGIN{p=0} { sub(/\r/,"") } NF==0 { p=1; next } p { print }')"
  if [ "$status" = "200" ]; then
    sha="$(printf '%s\n' "$body" | jq -r '.sha // empty' 2>/dev/null || true)"
    if valid_sha "$sha"; then
      printf '%s\n' "$sha"
      exit 0
    fi
    break
  fi
  rate_limited=false
  if [ "$remaining" = "0" ] || printf '%s\n' "$body" | grep -qi 'rate limit'; then
    rate_limited=true
  fi
  if [ "$rate_limited" = true ] && [[ "$reset" =~ ^[0-9]+$ ]]; then
    now="$(date +%s)"
    wait=$((reset - now + 1))
    if [ "$wait" -lt 0 ]; then
      wait=0
    fi
    if [ $((now + wait)) -le $((now + budget)) ]; then
      echo "::warning::Holding ${wait}s for the GitHub rate limit reset before retrying main." >&2
      sleep "$wait"
      continue
    fi
    echo "::error::Could not resolve refs/heads/main for ${repository}: GitHub rate limit resets at ${reset}, outside the ${budget}s budget." >&2
    exit 1
  fi
  break
done

echo "::error::Could not resolve refs/heads/main for ${repository} via git ls-remote." >&2
exit 1
