#!/usr/bin/env bash
# Retry wrapper for `gh` on transient GitHub API failures (429/500/502/503/504).
# Usage: source scripts/lib/gh-retry.sh, then gh_retry pr list ...

gh_retry_is_transient_error() {
  local err="$1"
  # An installation whose quota is already exhausted cannot recover inside a
  # short retry loop. Retrying only monopolizes the repo-wide queue writer
  # until GitHub's hourly reset, so fail fast and let the next event retry with
  # a fresh quota window. Actions' GITHUB_TOKEN reports the same exhaustion
  # as "for site ID installation" (JOV-7744 storm, 2026-10-03).
  if grep -qiE "API rate limit already exceeded for (installation ID|site ID installation)" <<<"$err"; then
    return 1
  fi
  grep -qiE "HTTP (429|500|502|503|504)|rate limit|timed out|timeout|couldn't respond|stream error|stream ID [0-9]+; CANCEL|unexpected end of JSON input|unexpected EOF|connection reset" <<<"$err"
}

gh_retry() {
  # gh may ANSI-color JSON when it thinks stdout is a TTY; callers parse with jq.
  export NO_COLOR=1
  export GH_FORCE_TTY=0
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local err_file out_file
  err_file="$(mktemp)"
  out_file="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$err_file' '$out_file'" RETURN

  while [[ "$attempt" -le "$attempts" ]]; do
    # gh colorizes JSON when stdout is a pipe; that breaks downstream jq.
    # gh writes HTTP error bodies to stdout too. Publish only a successful
    # attempt, so a recovered JSON read never includes prior error payloads.
    if NO_COLOR=1 GH_FORCE_TTY=false gh "$@" >"$out_file" 2>"$err_file"; then
      cat "$out_file"
      rm -f "$err_file" "$out_file"
      return 0
    fi

    local err
    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] \
      || ! gh_retry_is_transient_error "$err"; then
      echo "$err" >&2
      rm -f "$err_file" "$out_file"
      return 1
    fi

    local delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$err_file" "$out_file"
  return 1
}
