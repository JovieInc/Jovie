#!/usr/bin/env bash
# Read one GitHub REST resource for the post-deploy probe workflow.
# Installation quota exhaustion cannot clear inside this job (the hourly
# reset is the recovery), so it is recorded as a deferral and the caller
# exits 0. A deferred read must not page production. Real GitHub failures
# and exhausted transient errors still exit non-zero.
#
# Usage (sourced): read_github_json <endpoint> <dest_var>
# On success, assigns the JSON body to the named variable.

read_github_json() {
  local endpoint="$1"
  local dest_var="$2"
  local status=0
  local body err_file repo_root source_dir
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "$source_dir/../.." && pwd)"
  err_file="$(mktemp)"
  body="$(
    node "$repo_root/scripts/lib/github-rate-limit.mjs" run \
      --max-wait-seconds 0 \
      --attempts 2 \
      -- gh api "$endpoint" \
      2>"$err_file"
  )" || status=$?
  if [ "$status" -eq 75 ] &&
    grep -Eq 'GitHub (primary|secondary)-rate-limit' "$err_file"; then
    cat "$err_file" >&2
    rm -f "$err_file"
    echo "quota_deferred=true" >> "$GITHUB_OUTPUT"
    echo "should_probe=false" >> "$GITHUB_OUTPUT"
    echo "::warning::GitHub installation quota deferred this post-deploy read; not a production failure."
    exit 0
  fi
  if [ "$status" -ne 0 ]; then
    cat "$err_file" >&2
    rm -f "$err_file"
    echo "::error::GitHub read failed for ${endpoint}."
    exit "$status"
  fi
  rm -f "$err_file"
  printf -v "$dest_var" '%s' "$body"
}
