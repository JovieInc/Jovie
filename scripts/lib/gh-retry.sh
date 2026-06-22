#!/usr/bin/env bash
# Retry wrapper for `gh` on transient GitHub API failures (429/502/503/504).
# Usage: source scripts/lib/gh-retry.sh, then gh_retry pr list ...

gh_retry() {
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local err_file
  err_file="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$err_file'" RETURN

  while [[ "$attempt" -le "$attempts" ]]; do
    if gh "$@" 2>"$err_file"; then
      rm -f "$err_file"
      return 0
    fi

    local err
    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] \
      || ! grep -qiE 'HTTP (429|502|503|504)|rate limit|timed out|timeout|couldn'\''t respond|stream error|CANCEL|connection reset|unexpected EOF' <<<"$err"; then
      echo "$err" >&2
      rm -f "$err_file"
      return 1
    fi

    local delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$err_file"
  return 1
}
