#!/usr/bin/env bash
# Prepare the complete base..head commit range needed by the gated CI secret scan
# without fetching every branch, tag, and historical blob in the repository.
set -euo pipefail

EVENT_BASE_SHA="${1:-}"
BASE_SHA="$EVENT_BASE_SHA"
HEAD_SHA="${2:-${GITHUB_SHA:-}}"
CURRENT_REF="${3:-${GITHUB_REF:-}}"
CURRENT_SHA="${4:-$HEAD_SHA}"
CURRENT_BASE_REF="${5:-}"
REMOTE="${SECRET_SCAN_REMOTE:-origin}"
GIT_BIN="${SECRET_SCAN_GIT_BIN:-git}"
HEAD_REF="refs/secret-scan/exact-head"
BASE_REF="refs/secret-scan/exact-base"
EVENT_BASE_REF="refs/secret-scan/event-base"
SOURCE_REF="refs/secret-scan/exact-source"
LIVE_BASE_REF="refs/secret-scan/live-base"
NETWORK_PID=""
PULL_REQUEST_MODE=false
SCAN_HEAD_SHA="$HEAD_SHA"
DEADLINE_SECONDS="${SECRET_SCAN_RANGE_DEADLINE_SECONDS:-90}"

fail() {
  echo "::error title=Secret scan range preparation failed::$*" >&2
  exit 1
}

if [[ ! "$DEADLINE_SECONDS" =~ ^[1-9][0-9]*$ ]] \
  || (( DEADLINE_SECONDS > 300 )); then
  fail "range deadline must be an integer from 1 to 300 seconds"
fi
DEADLINE_EPOCH=$(( $(date +%s) + DEADLINE_SECONDS ))

remaining_deadline_seconds() {
  local remaining
  remaining=$(( DEADLINE_EPOCH - $(date +%s) ))
  (( remaining > 0 )) || return 124
  printf '%s\n' "$remaining"
}

cancel_active_network_command() {
  local attempt
  if [[ -n "$NETWORK_PID" ]]; then
    kill -TERM "$NETWORK_PID" 2>/dev/null || true
    for (( attempt = 0; attempt < 10; attempt++ )); do
      kill -0 "$NETWORK_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$NETWORK_PID" 2>/dev/null || true
    wait "$NETWORK_PID" 2>/dev/null || true
  fi
  NETWORK_PID=""
}

run_bounded_network_command() {
  local status=0
  remaining_deadline_seconds >/dev/null || {
    echo "::error title=Secret scan range deadline exceeded::The ${DEADLINE_SECONDS}s absolute network budget was exhausted." >&2
    return 124
  }

  "$@" &
  NETWORK_PID=$!
  trap cancel_active_network_command EXIT
  trap 'cancel_active_network_command; exit 143' INT TERM
  while [[ -n "$NETWORK_PID" ]] && kill -0 "$NETWORK_PID" 2>/dev/null; do
    if ! remaining_deadline_seconds >/dev/null; then
      cancel_active_network_command
      trap - EXIT INT TERM
      echo "::error title=Secret scan range deadline exceeded::The ${DEADLINE_SECONDS}s absolute network budget was exhausted." >&2
      return 124
    fi
    sleep 0.2
  done
  wait "$NETWORK_PID" || status=$?
  NETWORK_PID=""
  trap - EXIT INT TERM

  if ! remaining_deadline_seconds >/dev/null; then
    echo "::error title=Secret scan range deadline exceeded::The ${DEADLINE_SECONDS}s absolute network budget was exhausted." >&2
    return 124
  fi
  return "$status"
}

if [[ ! "$EVENT_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || [[ "$EVENT_BASE_SHA" == "0000000000000000000000000000000000000000" ]]; then
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

read_remote_ref_sha() {
  local ref_name="$1" description="$2" remote_output remote_sha
  remote_output="$(
    run_bounded_network_command \
      "$GIT_BIN" ls-remote --exit-code "$REMOTE" "$ref_name"
  )" || fail "$description ref lookup failed or exceeded the absolute deadline"
  remote_sha="$(
    awk -v expected_ref="$ref_name" '$2 == expected_ref { print $1; exit }' \
      <<<"$remote_output"
  )"
  if [[ ! "$remote_sha" =~ ^[0-9a-f]{40}$ ]]; then
    fail "$description ref did not resolve to one exact commit"
  fi
  printf '%s\n' "$remote_sha"
}

if [[ "$CURRENT_REF" =~ ^refs/pull/[0-9]+/head$ ]]; then
  PULL_REQUEST_MODE=true
  if [[ "$CURRENT_BASE_REF" != refs/heads/* ]] \
    || ! "$GIT_BIN" check-ref-format "$CURRENT_BASE_REF"; then
    fail "pull request base ref must be an exact refs/heads/* name"
  fi
  # GitHub may regenerate refs/pull/<n>/merge without changing its tree or
  # parents. Guard the fork-safe source-head ref and authoritative base ref,
  # while preserving the checked-out event merge's immutable first parent as
  # the scan base. The pull_request payload base SHA may lag that parent after
  # an asynchronous Update Branch operation, and the live base may advance
  # beyond it after GitHub creates the event.
  # Read the raw commit object because Git intentionally hides parent edges
  # from ordinary revision commands when HEAD is a depth-1 shallow boundary.
  EVENT_PARENTS="$(
    "$GIT_BIN" cat-file commit "$HEAD_SHA" \
      | sed -n -e '/^$/q' -e 's/^parent //p' \
      | paste -sd ' ' -
  )"
  EVENT_PARENT_COUNT="$(wc -w <<<"$EVENT_PARENTS" | tr -d ' ')"
  EVENT_MERGE_BASE_SHA="${EVENT_PARENTS%% *}"
  EVENT_SOURCE_SHA="${EVENT_PARENTS#* }"
  if [[ "$EVENT_PARENT_COUNT" != 2 ]] || [[ "$EVENT_SOURCE_SHA" != "$CURRENT_SHA" ]]; then
    fail "pull request event head does not have exact ordered merge-base/source parent topology"
  fi
  BASE_SHA="$EVENT_MERGE_BASE_SHA"
  # Resolve once before any fetch so a missing or malformed base ref fails
  # immediately. Later reads intentionally allow it to advance, provided the
  # immutable event merge base remains its ancestor.
  read_remote_ref_sha "$CURRENT_BASE_REF" 'pull request base' >/dev/null
  if [[ "$EVENT_BASE_SHA" != "$BASE_SHA" ]]; then
    echo "Resolved stale pull request event base $EVENT_BASE_SHA to immutable event merge base $BASE_SHA."
  fi
elif [[ "$CURRENT_SHA" != "$HEAD_SHA" ]]; then
  fail "non-pull-request current ref SHA must match the event SHA"
fi

assert_current_ref_is_current() {
  local remote_output remote_head
  remote_output="$(
    run_bounded_network_command \
      "$GIT_BIN" ls-remote --exit-code "$REMOTE" "$CURRENT_REF"
  )" \
    || fail "current ref is no longer available; this run was superseded"
  remote_head="$(
    awk -v expected_ref="$CURRENT_REF" '$2 == expected_ref { print $1; exit }' \
      <<<"$remote_output"
  )"
  if [[ "$remote_head" != "$CURRENT_SHA" ]]; then
    fail "current ref moved from $CURRENT_SHA to ${remote_head:-missing}; refusing to scan a stale range"
  fi
}

pull_request_lineage_is_complete() {
  local live_base_sha
  [[ "$PULL_REQUEST_MODE" == true ]] || return 0
  "$GIT_BIN" cat-file -e "${CURRENT_SHA}^{commit}" 2>/dev/null || return 1
  "$GIT_BIN" cat-file -e "${EVENT_BASE_SHA}^{commit}" 2>/dev/null || return 1
  "$GIT_BIN" cat-file -e "${LIVE_BASE_REF}^{commit}" 2>/dev/null || return 1
  live_base_sha="$($GIT_BIN rev-parse "$LIVE_BASE_REF")"
  "$GIT_BIN" merge-base --is-ancestor "$EVENT_BASE_SHA" "$BASE_SHA" 2>/dev/null \
    || return 1
  "$GIT_BIN" merge-base --is-ancestor "$BASE_SHA" "$live_base_sha" 2>/dev/null \
    || return 1
}

range_is_complete() {
  local boundary shallow_file
  if ! "$GIT_BIN" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
    return 1
  fi
  if ! "$GIT_BIN" merge-base --is-ancestor "$BASE_SHA" "$SCAN_HEAD_SHA" 2>/dev/null; then
    return 1
  fi
  pull_request_lineage_is_complete || return 1

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

  event_tree="$($GIT_BIN rev-parse "${HEAD_SHA}^{tree}")"

  # The checked-out GitHub merge object can become unadvertised while its tree
  # remains the valid event result. Re-anchor that exact tree to the already
  # verified base/source parents in a local, non-shallow scan-only commit.
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

verify_pull_request_semantics() {
  local event_tree live_base_sha merge_tree_output recomputed_tree

  [[ "$PULL_REQUEST_MODE" == true ]] || return 0
  "$GIT_BIN" cat-file -e "${EVENT_BASE_SHA}^{commit}" 2>/dev/null \
    || fail "pull request event base commit was not fetched"
  "$GIT_BIN" cat-file -e "${LIVE_BASE_REF}^{commit}" 2>/dev/null \
    || fail "authoritative pull request base ref was not fetched"
  "$GIT_BIN" merge-base --is-ancestor "$EVENT_BASE_SHA" "$BASE_SHA" \
    || fail "pull request event base is not an ancestor of the immutable event merge base"
  live_base_sha="$($GIT_BIN rev-parse "$LIVE_BASE_REF")"
  "$GIT_BIN" merge-base --is-ancestor "$BASE_SHA" "$live_base_sha" \
    || fail "immutable event merge base is not an ancestor of the authoritative base ref"

  event_tree="$($GIT_BIN rev-parse "${HEAD_SHA}^{tree}")"
  # This honors checked-in attributes and Git's built-in merge drivers. Any
  # server-only driver or merge.renormalize configuration that changes the
  # result is an intentional fail-closed compatibility boundary.
  merge_tree_output="$($GIT_BIN merge-tree --write-tree "$BASE_SHA" "$CURRENT_SHA")" \
    || fail "could not recompute the exact event merge tree from ordered base/source parents"
  recomputed_tree="${merge_tree_output%%$'\n'*}"
  if [[ ! "$recomputed_tree" =~ ^[0-9a-f]{40}$ ]] \
    || [[ "$($GIT_BIN cat-file -t "$recomputed_tree" 2>/dev/null || true)" != tree ]]; then
    fail "recomputed pull request merge did not produce one exact tree"
  fi
  [[ "$recomputed_tree" == "$event_tree" ]] \
    || fail "checked-out pull request event tree does not match the exact recomputed merge tree"
}

assert_current_ref_is_current

if [[ "$PULL_REQUEST_MODE" == true ]]; then
  # Always fetch all four independently meaningful coordinates. This makes the
  # immutable event merge base authoritative for the scan while still proving
  # that both the event payload base and the moving live base ref descend in
  # the only safe direction. Repeated final-depth attempts tolerate ordinary
  # main advancement without an Update Branch or CI retry loop.
  PR_PROOF_COMPLETE=false
  LAST_LIVE_BASE_SHA=""
  LAST_REMOTE_BASE_SHA=""
  for fetch_depth in 32 160 672 2720 2720 2720; do
    assert_current_ref_is_current
    fetch_status=0
    run_bounded_network_command "$GIT_BIN" fetch \
      --quiet \
      --no-tags \
      --no-recurse-submodules \
      --depth="$fetch_depth" \
      "$REMOTE" \
      "+${CURRENT_REF}:${SOURCE_REF}" \
      "+${BASE_SHA}:${BASE_REF}" \
      "+${EVENT_BASE_SHA}:${EVENT_BASE_REF}" \
      "+${CURRENT_BASE_REF}:${LIVE_BASE_REF}" \
      || fetch_status=$?
    if [[ $fetch_status -ne 0 ]]; then
      echo "::error title=Secret scan range fetch failed::Exact range fetch stopped with status $fetch_status" >&2
      exit "$fetch_status"
    fi
    if [[ "$($GIT_BIN rev-parse "$SOURCE_REF")" != "$CURRENT_SHA" ]]; then
      fail "range fetch did not preserve the exact pull request source SHA"
    fi
    if [[ "$($GIT_BIN rev-parse "$BASE_REF")" != "$BASE_SHA" ]]; then
      fail "range fetch did not preserve the immutable event merge base SHA"
    fi
    if [[ "$($GIT_BIN rev-parse "$EVENT_BASE_REF")" != "$EVENT_BASE_SHA" ]]; then
      fail "range fetch did not preserve the pull request event base SHA"
    fi

    prepare_pull_request_scan_head
    assert_current_ref_is_current
    LAST_LIVE_BASE_SHA="$($GIT_BIN rev-parse "$LIVE_BASE_REF")"
    LAST_REMOTE_BASE_SHA="$(read_remote_ref_sha "$CURRENT_BASE_REF" 'pull request base')"
    if [[ "$LAST_LIVE_BASE_SHA" != "$LAST_REMOTE_BASE_SHA" ]]; then
      echo "Pull request base advanced during range fetch; refreshing immutable-event proof."
      continue
    fi
    range_is_complete || continue
    verify_pull_request_semantics
    assert_current_ref_is_current
    LAST_REMOTE_BASE_SHA="$(read_remote_ref_sha "$CURRENT_BASE_REF" 'pull request base')"
    if [[ "$LAST_LIVE_BASE_SHA" != "$LAST_REMOTE_BASE_SHA" ]]; then
      echo "Pull request base advanced during semantic proof; refreshing immutable-event proof."
      continue
    fi
    PR_PROOF_COMPLETE=true
    break
  done

  if [[ "$PR_PROOF_COMPLETE" != true ]]; then
    # Prefer a precise lineage/tree classification over a generic depth error.
    verify_pull_request_semantics
    range_is_complete \
      || fail "base..head history remains shallow after bounded exact-range fetches"
    fail "pull request base ref did not converge on one descendant during bounded proof"
  fi
else
  if ! range_is_complete; then
    # The first step covers ordinary and moderately stacked queue/push ranges.
    # Later steps are fail-closed escape hatches for unusually deep ranges.
    for fetch_depth in 32 160 672 2720; do
      assert_current_ref_is_current
      fetch_status=0
      run_bounded_network_command "$GIT_BIN" fetch \
        --quiet \
        --no-tags \
        --no-recurse-submodules \
        --deepen="$((fetch_depth - ${previous_depth:-0}))" \
        "$REMOTE" "+${HEAD_SHA}:${HEAD_REF}" \
        || fetch_status=$?
      previous_depth="$fetch_depth"
      if [[ $fetch_status -ne 0 ]]; then
        echo "::error title=Secret scan range fetch failed::Exact range fetch stopped with status $fetch_status" >&2
        exit "$fetch_status"
      fi
      if [[ "$($GIT_BIN rev-parse "$HEAD_REF")" != "$HEAD_SHA" ]]; then
        fail "range fetch did not preserve the exact event SHA"
      fi
      range_is_complete && break
    done
  fi
  assert_current_ref_is_current
  range_is_complete \
    || fail "base..head history remains shallow after bounded exact-range fetches"
fi

remaining_deadline_seconds >/dev/null \
  || fail "the ${DEADLINE_SECONDS}s absolute range-preparation deadline was exhausted"
"$GIT_BIN" update-ref "$HEAD_REF" "$SCAN_HEAD_SHA"
"$GIT_BIN" update-ref "$BASE_REF" "$BASE_SHA"

echo "Prepared complete secret scan range ${BASE_SHA}..${SCAN_HEAD_SHA} ($($GIT_BIN rev-list --count "${BASE_SHA}..${SCAN_HEAD_SHA}") commits; event head ${HEAD_SHA}; current ref ${CURRENT_REF} at ${CURRENT_SHA})."
