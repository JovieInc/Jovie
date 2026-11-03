#!/usr/bin/env bash
# Fetch complete, full-blob history for the checked-out source and current base.
set -euo pipefail
export GIT_NO_LAZY_FETCH=1

head_sha="${1:?expected source SHA}"
base_ref="${2:?expected base branch}"
fail() { echo "::error title=Security Evidence history incomplete::$*" >&2; exit 1; }
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'invalid source SHA'
git check-ref-format "refs/heads/$base_ref" || fail 'invalid base branch'
[[ "$(git rev-parse HEAD)" == "$head_sha" ]] || fail 'checked-out HEAD differs from source SHA'
[[ -z "${GIT_ALTERNATE_OBJECT_DIRECTORIES:-}" ]] || fail 'object alternates are not supported'
[[ ! -s "$(git rev-parse --git-path objects/info/alternates)" ]] || fail 'object alternates are not supported'
[[ -z "$(git config --get extensions.partialClone || :)" ]] || fail 'partial clone is not supported'
[[ -z "$(git config --get-regexp '^remote\..*\.promisor$' || :)" ]] || fail 'promisor remote is not supported'
[[ -z "$(git config --get-regexp '^remote\..*\.partialclonefilter$' || :)" ]] || fail 'partial clone filter is not supported'

# Checkout starts shallow. Unshallow both selected tips without fetching all
# branches or tags; never use an object filter because scanners read blobs.
fetch_depth=()
if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
  fetch_depth=(--unshallow)
fi
git fetch --no-tags --no-recurse-submodules "${fetch_depth[@]}" origin \
  "+${head_sha}:refs/security-evidence/head" \
  "+refs/heads/${base_ref}:refs/remotes/origin/${base_ref}"
[[ "$(git rev-parse --is-shallow-repository)" == false ]] || fail 'repository remains shallow'
[[ "$(git rev-parse refs/security-evidence/head)" == "$head_sha" ]] || fail 'fetched source differs from event SHA'
base_sha="$(git rev-parse "refs/remotes/origin/${base_ref}^{commit}")"
git merge-base "$base_sha" "$head_sha" >/dev/null || fail 'source and base have no merge base'

# rev-list exposes missing traversal objects; batch-check also catches missing
# or unreadable blobs. Avoid lazy promisor downloads masking incompleteness.
objects="$(mktemp)"
trap 'rm -f "$objects"' EXIT
git rev-list --objects --missing=print "$head_sha" "$base_sha" > "$objects" || fail 'cannot traverse selected history'
if grep -q '^?' "$objects"; then fail 'selected history has missing objects'; fi
if ! cut -d ' ' -f 1 "$objects" | git cat-file --batch-check='%(objectname) %(objecttype)' | awk 'NF != 2 || $2 == "missing" { bad=1 } END { exit bad }'; then
  fail 'selected history has unreadable objects'
fi
# Force Git to decompress the complete contents, not just inspect headers.
cut -d ' ' -f 1 "$objects" | git cat-file --batch > /dev/null \
  || fail 'selected history has corrupt or unreadable objects'
