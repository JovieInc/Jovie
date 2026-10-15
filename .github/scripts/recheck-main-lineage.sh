#!/usr/bin/env bash
# Decide whether EXPECTED_SHA is still on main (exact, or an ancestor).
#
# REST compare is exact, but this read runs after the rest of the release has
# already spent the shared GitHub App installation quota. A primary 403
# ("API rate limit exceeded for installation") does not recover inside the
# job, so that failure resolves main through the git protocol instead. A read
# that still cannot be proven exits non-zero. A proven rewind or rewrite
# yields with is_current=false.
set -euo pipefail

context="${1:-before continuing}"
expected="${EXPECTED_SHA:-${EXPECTED_MAIN_SHA:-}}"
repository="${GITHUB_REPOSITORY:-${REPOSITORY:-}}"
remote="${MAIN_LINEAGE_REMOTE:-https://github.com/${repository}.git}"
gh_cli="${GH_CLI:-gh}"

[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::expected_sha must be a full commit SHA." >&2
  exit 1
}
[[ "$repository" =~ ^[^/]+/[^/]+$ ]] || {
  echo "::error::GITHUB_REPOSITORY must be owner/name." >&2
  exit 1
}

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

configure_git_auth() {
  if [ -n "${GH_TOKEN:-}" ] && [[ "$remote" == https://* ]]; then
    export GIT_CONFIG_COUNT=1
    export GIT_CONFIG_KEY_0=http.extraheader
    export GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer ${GH_TOKEN}"
  fi
}

gh_capture() {
  local err output status
  err="$(mktemp)"
  set +e
  output="$("$gh_cli" api "$@" 2>"$err")"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    printf '%s\n' "$output"
    rm -f "$err"
    return 0
  fi
  cat "$err" >&2
  rm -f "$err"
  return 1
}

read_main_sha() {
  local sha status
  set +e
  sha="$(gh_capture "repos/${repository}/commits/main" --jq '.sha // empty')"
  status=$?
  set -e
  if [ "$status" -eq 0 ] && [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "$sha"
    return 0
  fi
  if [ "$status" -eq 0 ]; then
    echo "::error::GitHub returned an invalid main HEAD ${context}." >&2
    return 1
  fi
  echo "::warning::REST main read failed ${context}; resolving main with git." >&2
  configure_git_auth
  if ! sha="$(git ls-remote "$remote" refs/heads/main | awk 'NR==1 { print $1 }')"; then
    echo "::error::git could not resolve main ${context}." >&2
    return 1
  fi
  printf '%s\n' "$sha"
}

git_lineage() {
  local current="$1"
  configure_git_auth
  (
    set -euo pipefail
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    git init -q "$work"

    judged() {
      local tip ancestor_status
      tip="$(git -C "$work" rev-parse refs/remotes/origin/main)"
      if [ "$tip" != "$current" ]; then
        echo "::error::main moved from ${current} to ${tip} while proving lineage ${context}." >&2
        exit 1
      fi
      if git -C "$work" merge-base --is-ancestor "$expected" "$tip" 2>/dev/null; then
        printf 'ahead\n'
        exit 0
      else
        ancestor_status=$?
      fi
      if [ "$(git -C "$work" rev-parse --is-shallow-repository)" != "true" ]; then
        printf 'diverged\n'
        exit 0
      fi
      if [ "$ancestor_status" -ne 1 ] && [ "$ancestor_status" -ne 128 ]; then
        echo "::error::git could not compare ${expected} with ${current} ${context}." >&2
        exit 1
      fi
      return 1
    }

    for depth in 300 4000; do
      git -C "$work" fetch --no-tags --filter=blob:none --depth="$depth" \
        "$remote" 'refs/heads/main:refs/remotes/origin/main'
      judged && exit 0
    done

    git -C "$work" fetch --no-tags --filter=blob:none --deepen=8000 \
      "$remote" 'refs/heads/main:refs/remotes/origin/main' || true
    if judged; then
      exit 0
    fi
    echo "::error::Could not prove whether ${expected} is still on main (${current}) ${context}; git history is still shallow." >&2
    exit 1
  )
}

compare_status() {
  local current="$1" status api_status
  if [ "$current" = "$expected" ]; then
    printf 'identical\n'
    return 0
  fi
  set +e
  status="$(gh_capture "repos/${repository}/compare/${expected}...${current}" --jq '.status // empty')"
  api_status=$?
  set -e
  if [ "$api_status" -eq 0 ]; then
    printf '%s\n' "$status"
    return 0
  fi
  echo "::warning::REST compare failed ${context}; proving ancestry with git." >&2
  git_lineage "$current"
}

current="$(read_main_sha)" || exit 1
[[ "$current" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::GitHub returned an invalid main HEAD ${context}." >&2
  exit 1
}

lineage="$(compare_status "$current")" || exit 1
if [ "$lineage" != "identical" ] && [ "$lineage" != "ahead" ]; then
  echo "::notice::Release ${expected} left main's lineage (main is ${current}) ${context}."
  emit is_current false
else
  emit is_current true
fi
