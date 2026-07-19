#!/usr/bin/env bash
# Prepare the complete base..head commit range needed by the gated CI secret scan
# without fetching every branch, tag, and historical blob in the repository.
set -euo pipefail

BASE_SHA="${1:-}"
HEAD_SHA="${2:-${GITHUB_SHA:-}}"
FETCH_REF="${3:-${GITHUB_REF:-}}"
REMOTE="${SECRET_SCAN_REMOTE:-origin}"
GIT_BIN="${SECRET_SCAN_GIT_BIN:-git}"
HEAD_REF="refs/secret-scan/exact-head"
BASE_REF="refs/secret-scan/exact-base"
FETCH_PID=""

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
if [[ "$FETCH_REF" != refs/* ]] || ! "$GIT_BIN" check-ref-format "$FETCH_REF"; then
  fail "event ref must be an exact refs/* name"
fi
if [[ "$($GIT_BIN rev-parse HEAD)" != "$HEAD_SHA" ]]; then
  fail "checked-out HEAD does not match the event SHA"
fi

assert_event_ref_is_current() {
  local remote_head
  remote_head="$($GIT_BIN ls-remote --exit-code "$REMOTE" "$FETCH_REF" \
    | awk -v expected_ref="$FETCH_REF" '$2 == expected_ref { print $1; exit }')" \
    || fail "event ref is no longer available; this run was superseded"
  if [[ "$remote_head" != "$HEAD_SHA" ]]; then
    fail "event ref moved from $HEAD_SHA to ${remote_head:-missing}; refusing to scan a stale range"
  fi
}

range_is_complete() {
  local boundary shallow_file
  if ! "$GIT_BIN" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
    return 1
  fi
  if ! "$GIT_BIN" merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" 2>/dev/null; then
    return 1
  fi

  shallow_file="$($GIT_BIN rev-parse --git-path shallow)"
  [[ -f "$shallow_file" ]] || return 0

  # The range is complete when every shallow boundary reachable from HEAD is
  # also reachable from the excluded base. A boundary on the PR/queue/push side
  # would hide an introduced-then-removed secret from both scanners.
  while IFS= read -r boundary; do
    [[ -n "$boundary" ]] || continue
    if "$GIT_BIN" merge-base --is-ancestor "$boundary" "$HEAD_SHA" 2>/dev/null \
      && ! "$GIT_BIN" merge-base --is-ancestor "$boundary" "$BASE_SHA" 2>/dev/null; then
      return 1
    fi
  done <"$shallow_file"
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

assert_event_ref_is_current

if ! range_is_complete; then
  # The first step covers ordinary and moderately stacked PRs. Later steps are
  # fail-closed escape hatches for unusually deep ranges, while still fetching
  # only ancestry reachable from this exact event SHA.
  for deepen_by in 32 128 512 2048; do
    assert_event_ref_is_current
    fetch_status=0
    run_cancellable_fetch \
      --quiet \
      --no-tags \
      --no-recurse-submodules \
      --deepen="$deepen_by" \
      "$REMOTE" "+${HEAD_SHA}:${HEAD_REF}" \
      || fetch_status=$?
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

range_is_complete || fail "base..head history remains shallow after bounded exact-range fetches"

"$GIT_BIN" update-ref "$HEAD_REF" "$HEAD_SHA"
"$GIT_BIN" update-ref "$BASE_REF" "$BASE_SHA"

echo "Prepared complete secret scan range ${BASE_SHA}..${HEAD_SHA} ($($GIT_BIN rev-list --count "${BASE_SHA}..${HEAD_SHA}") commits; exact event ref ${FETCH_REF})."
