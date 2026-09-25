#!/usr/bin/env bash
# Base-relative ratchet for docs/REPOSITORY_SOURCES.md parity.
#
# Usage: repository-docs-ratchet.sh <head-root> [<base-root>]
#
#   head fresh                          -> pass
#   no base root                        -> head must be fresh (strict)
#   base fresh, head stale              -> fail (this change made it stale)
#   both stale, head adds no new drift  -> pass with warning (inherited)
#   both stale, head adds new drift     -> fail
#
# "Drift" is the set of lines regeneration would change in the committed
# projection. The pinned scripts/repository_docs.py is only invoked, never
# modified; each tree's committed projection is restored after regenerating.
set -uo pipefail

DOCS_SCRIPT="${REPOSITORY_DOCS_SCRIPT:-$(cd "$(dirname "$0")/../.." && pwd)/scripts/repository_docs.py}"
HEAD_ROOT="${1:?usage: repository-docs-ratchet.sh <head-root> [<base-root>]}"
BASE_ROOT="${2:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Print the sorted, unique set of diff lines ("<" committed / ">" regenerated)
# that regenerating <root> would change. Fails when regeneration fails.
stale_lines() {
  local root="$1" out="$2" output committed rc had=0
  output="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["output"])' "$root/repository-docs.json")" || return 1
  committed="$WORK/committed"
  : >"$committed"
  if [ -f "$root/$output" ]; then cp "$root/$output" "$committed" && had=1; fi
  python3 "$DOCS_SCRIPT" --root "$root" --write >/dev/null
  rc=$?
  if [ "$rc" -eq 0 ]; then
    diff "$committed" "$root/$output" | grep -E '^[<>] ' | LC_ALL=C sort -u >"$out"
  fi
  if [ "$had" -eq 1 ]; then cp "$committed" "$root/$output"; else rm -f "$root/$output"; fi
  return "$rc"
}

if python3 "$DOCS_SCRIPT" --root "$HEAD_ROOT"; then
  exit 0
fi
if [ -z "$BASE_ROOT" ]; then
  exit 1
fi
if python3 "$DOCS_SCRIPT" --root "$BASE_ROOT"; then
  echo "::error::This PR makes docs/REPOSITORY_SOURCES.md stale; run: python3 scripts/repository_docs.py --write"
  exit 1
fi

if ! stale_lines "$HEAD_ROOT" "$WORK/head.txt"; then
  echo "::error::Could not regenerate docs/REPOSITORY_SOURCES.md for this PR; run: python3 scripts/repository_docs.py --write"
  exit 1
fi
if ! stale_lines "$BASE_ROOT" "$WORK/base.txt"; then
  echo "::warning::docs/REPOSITORY_SOURCES.md is already stale on the base branch and the base cannot be regenerated for comparison; not caused by this PR"
  exit 0
fi

added="$(LC_ALL=C comm -13 "$WORK/base.txt" "$WORK/head.txt")"
if [ -n "$added" ]; then
  echo "::error::This PR adds new docs/REPOSITORY_SOURCES.md drift on top of the stale base; run: python3 scripts/repository_docs.py --write"
  echo "New drift (diff of committed '<' vs regenerated '>'):"
  printf '%s\n' "$added"
  exit 1
fi
echo "::warning::docs/REPOSITORY_SOURCES.md is already stale on the base branch; this PR adds no new drift"
exit 0
