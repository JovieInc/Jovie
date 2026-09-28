#!/usr/bin/env bash
set -euo pipefail

revision=${1:-HEAD}
mode=${2:---archive}
tree=$(git rev-parse --verify "${revision}^{tree}")

paths=(
  .npmrc
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  .github/runner-image/Dockerfile
  .github/runner-image/create-installed-tree.mjs
  .github/runner-image/prerequisites.json
  .github/runner-image/restore-installed-tree.sh
  .github/runner-image/verify-prerequisites.mjs
)

while IFS= read -r package_manifest; do
  paths+=("${package_manifest}")
done < <(
  git ls-tree -r --name-only "${tree}" \
    | LC_ALL=C grep -E '^(apps|packages|workers)/[^/]+/package\.json$'
)

while IFS= read -r patch_path; do
  paths+=("${patch_path}")
done < <(
  git show "${tree}:pnpm-lock.yaml" \
    | sed -nE 's/^[[:space:]]+path: (patches\/[^[:space:]]+\.patch)[[:space:]]*$/\1/p'
)

sorted_paths=()
while IFS= read -r path; do
  sorted_paths+=("${path}")
done < <(printf '%s\n' "${paths[@]}" | LC_ALL=C sort -u)

# Validate the complete context with one long-lived Git process. Spawning
# one `git cat-file` process per path dominates this script when the repository
# or host is busy, and this script is intentionally invoked repeatedly to
# prove deterministic archive output.
object_status=$(
  for path in "${sorted_paths[@]}"; do
    printf '%s:%s\n' "${tree}" "${path}"
  done | git cat-file --batch-check='%(objecttype)'
)
while IFS= read -r status; do
  if [[ "${status}" == *' missing' ]]; then
    echo "runner build context contains a missing tree entry: ${status% missing}" >&2
    exit 1
  fi
done <<< "${object_status}"

if [[ "${mode}" == '--list' ]]; then
  printf '%s\n' "${sorted_paths[@]}"
  exit 0
fi

if [[ "${mode}" != '--archive' ]]; then
  echo "usage: $0 [revision] [--archive|--list]" >&2
  exit 64
fi

# Archive the tree object, not the commit, to omit the commit-specific pax
# header. The fixed mtime makes identical prerequisite inputs byte-identical.
git archive --format=tar --mtime='1970-01-01T00:00:00Z' \
  "${tree}" -- "${sorted_paths[@]}"
