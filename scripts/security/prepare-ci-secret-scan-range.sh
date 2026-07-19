#!/usr/bin/env bash
# Prepare the complete base..head commit range needed by the gated CI secret scan
# without fetching every branch, tag, and historical blob in the repository.
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-${GITHUB_SHA:-}}"
CURRENT_REF="${3:-${GITHUB_REF:-}}"
CURRENT_SHA="${4:-$HEAD_SHA}"
REMOTE="${SECRET_SCAN_REMOTE:-origin}"
GIT_BIN="${SECRET_SCAN_GIT_BIN:-git}"
HEAD_REF="refs/secret-scan/exact-head"
BASE_REF="refs/secret-scan/exact-base"
SOURCE_REF="refs/secret-scan/exact-source"
FETCH_PID=""
PULL_REQUEST_MODE=false
SCAN_HEAD_SHA="$HEAD_SHA"

fail() {
  echo "::error title=Secret scan range preparation failed::$*" >&2
  exit 1
}

if [[ ! "$BASE_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || [[ "$BASE_SHA" == "0000000000000000000000000000000000000000" ]]; then
  fail "base SHA must be an exact 40-character lowercase commit id"
fi
if [[ ! "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || [[ "$HEAD_SHA" == "0000000000000000000000000000000000000000" ]]; then
  fail "head SHA must be an exact 40-character lowercase commit id"
fi
if [[ ! "$CURRENT_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || [[ "$CURRENT_SHA" == "0000000000000000000000000000000000000000" ]]; then
  fail "current ref SHA must be an exact 40-character lowercase commit id"
fi
if [[ "$CURRENT_REF" != refs/* ]] || ! "$GIT_BIN" check-ref-format "$CURRENT_REF"; then
  fail "current ref must be an exact refs/* name"
fi
if [[ "$($GIT_BIN rev-parse HEAD)" != "$HEAD_SHA" ]]; then
  fail "checked-out HEAD does not match the event SHA"
fi

if [[ "$CURRENT_REF" =~ ^refs/pull/[0-9]+/head$ ]]; then
  PULL_REQUEST_MODE=true
  # GitHub may regenerate refs/pull/<n>/merge without changing its tree or
  # parents. Guard the fork-safe source-head ref instead, and prove the
  # checked-out synthetic merge still represents the exact event base/head.
  # Read the raw commit object because Git intentionally hides parent edges
  # from ordinary revision commands when HEAD is a depth-1 shallow boundary.
  EVENT_PARENTS="$(
    "$GIT_BIN" cat-file commit "$HEAD_SHA" \
      | sed -n -e '/^$/q' -e 's/^parent //p' \
      | paste -sd ' ' -
  )"
  if [[ "$EVENT_PARENTS" != "$BASE_SHA $CURRENT_SHA" ]]; then
    fail "pull request event head does not have exact base/source parent topology"
  fi
elif [[ "$CURRENT_SHA" != "$HEAD_SHA" ]]; then
  fail "non-pull-request current ref SHA must match the event SHA"
fi

assert_current_ref_is_current() {
  local remote_head
  remote_head="$($GIT_BIN ls-remote --exit-code "$REMOTE" "$CURRENT_REF" \
    | awk -v expected_ref="$CURRENT_REF" '$2 == expected_ref { print $1; exit }')" \
    || fail "current ref is no longer available; this run was superseded"
  if [[ "$remote_head" != "$CURRENT_SHA" ]]; then
    fail "current ref moved from $CURRENT_SHA to ${remote_head:-missing}; refusing to scan a stale range"
  fi
}

range_is_complete() {
  local boundary shallow_file
  if ! "$GIT_BIN" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
    return 1
  fi
  if ! "$GIT_BIN" merge-base --is-ancestor "$BASE_SHA" "$SCAN_HEAD_SHA" 2>/dev/null; then
    return 1
  fi

  shallow_file="$($GIT_BIN rev-parse --git-path shallow)"
  [[ -f "$shallow_file" ]] || return 0

  # The range is complete when every shallow boundary reachable from HEAD is
  # also reachable from the excluded base. A boundary on the PR/queue/push side
  # would hide an introduced-then-removed secret from both scanners.
  while IFS= read -r boundary; do
    [[ -n "$boundary" ]] || continue
    if "$GIT_BIN" merge-base --is-ancestor "$boundary" "$SCAN_HEAD_SHA" 2>/dev/null \
      && ! "$GIT_BIN" merge-base --is-ancestor "$boundary" "$BASE_SHA" 2>/dev/null; then
      return 1
    fi
  done <"$shallow_file"
}

prepare_pull_request_scan_head() {
  local event_tree scan_head scan_parents scan_tree

  [[ "$PULL_REQUEST_MODE" == true ]] || return 0
  [[ "$SCAN_HEAD_SHA" == "$HEAD_SHA" ]] || return 0
  "$GIT_BIN" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null \
    || fail "exact pull request base commit was not fetched"
  "$GIT_BIN" cat-file -e "${CURRENT_SHA}^{commit}" 2>/dev/null \
    || fail "exact pull request source commit was not fetched"

  # The checked-out GitHub merge object can become unadvertised while its tree
  # remains the valid event result. Re-anchor that exact tree to the already
  # verified base/source parents in a local, non-shallow scan-only commit.
  event_tree="$($GIT_BIN rev-parse "${HEAD_SHA}^{tree}")"
  scan_head="$(
    printf 'Local CI secret-scan merge for %s\n' "$HEAD_SHA" \
      | env \
          GIT_AUTHOR_NAME='Jovie CI' \
          GIT_AUTHOR_EMAIL='ci@jov.ie' \
          GIT_COMMITTER_NAME='Jovie CI' \
          GIT_COMMITTER_EMAIL='ci@jov.ie' \
          "$GIT_BIN" commit-tree "$event_tree" -p "$BASE_SHA" -p "$CURRENT_SHA"
  )"
  [[ "$scan_head" != "$HEAD_SHA" ]] \
    || fail "local pull request scan commit remained a shallow event object"
  scan_tree="$($GIT_BIN rev-parse "${scan_head}^{tree}")"
  scan_parents="$(
    "$GIT_BIN" cat-file commit "$scan_head" \
      | sed -n -e '/^$/q' -e 's/^parent //p' \
      | paste -sd ' ' -
  )"
  [[ "$scan_tree" == "$event_tree" ]] \
    || fail "local pull request scan commit did not preserve the event tree"
  [[ "$scan_parents" == "$BASE_SHA $CURRENT_SHA" ]] \
    || fail "local pull request scan commit did not preserve exact parent topology"

  SCAN_HEAD_SHA="$scan_head"
  "$GIT_BIN" update-ref --no-deref HEAD "$SCAN_HEAD_SHA" "$HEAD_SHA"
}

cancel_fetch() {
  if [[ -n "$FETCH_PID" ]]; then
    kill -TERM "$FETCH_PID" 2>/dev/null || true
  fi
}

run_cancellable_fetch() {
  local status=0
  "$GIT_BIN" fetch "$@" &
  FETCH_PID=$!
  trap cancel_fetch EXIT INT TERM
  wait "$FETCH_PID" || status=$?
  trap - EXIT INT TERM
  FETCH_PID=""
  return "$status"
}

assert_current_ref_is_current

if ! range_is_complete; then
  # The first step covers ordinary and moderately stacked PRs. Later steps are
  # fail-closed escape hatches for unusually deep ranges, while still fetching
  # only ancestry reachable from this exact event SHA.
  for fetch_depth in 32 160 672 2720; do
    assert_current_ref_is_current
    fetch_status=0
    if [[ "$PULL_REQUEST_MODE" == true ]]; then
      # Fetch the stable pull source and exact base, never the mutable synthetic
      # merge ref. Cumulative depths retain the original bounded 2,720-commit
      # escape hatch without downloading unrelated refs.
      run_cancellable_fetch \
        --quiet \
        --no-tags \
        --no-recurse-submodules \
        --depth="$fetch_depth" \
        "$REMOTE" \
        "+${CURRENT_REF}:${SOURCE_REF}" \
        "+${BASE_SHA}:${BASE_REF}" \
        || fetch_status=$?
    else
      run_cancellable_fetch \
        --quiet \
        --no-tags \
        --no-recurse-submodules \
        --deepen="$((fetch_depth - ${previous_depth:-0}))" \
        "$REMOTE" "+${HEAD_SHA}:${HEAD_REF}" \
        || fetch_status=$?
      previous_depth="$fetch_depth"
    fi
    if [[ $fetch_status -ne 0 ]]; then
      echo "::error title=Secret scan range fetch failed::Exact range fetch stopped with status $fetch_status" >&2
      exit "$fetch_status"
    fi
    if [[ "$PULL_REQUEST_MODE" == true ]]; then
      if [[ "$($GIT_BIN rev-parse "$SOURCE_REF")" != "$CURRENT_SHA" ]]; then
        fail "range fetch did not preserve the exact pull request source SHA"
      fi
      if [[ "$($GIT_BIN rev-parse "$BASE_REF")" != "$BASE_SHA" ]]; then
        fail "range fetch did not preserve the exact pull request base SHA"
      fi
      prepare_pull_request_scan_head
    elif [[ "$($GIT_BIN rev-parse "$HEAD_REF")" != "$HEAD_SHA" ]]; then
      fail "range fetch did not preserve the exact event SHA"
    fi
    range_is_complete && break
  done
fi

assert_current_ref_is_current
range_is_complete || fail "base..head history remains shallow after bounded exact-range fetches"

"$GIT_BIN" update-ref "$HEAD_REF" "$SCAN_HEAD_SHA"
"$GIT_BIN" update-ref "$BASE_REF" "$BASE_SHA"

echo "Prepared complete secret scan range ${BASE_SHA}..${SCAN_HEAD_SHA} ($($GIT_BIN rev-list --count "${BASE_SHA}..${SCAN_HEAD_SHA}") commits; event head ${HEAD_SHA}; current ref ${CURRENT_REF} at ${CURRENT_SHA})."
