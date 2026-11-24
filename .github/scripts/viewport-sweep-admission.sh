#!/usr/bin/env bash
# Decides whether ci-profile-viewport-sweep runs: true when any pathspec in
# .github/viewport-sweep-paths.txt changed against the event's base.
# Kept out of ci.yml because GitHub rejects workflow files over 512,000 bytes.
set -euo pipefail
if [[ "$EVENT" == merge_group ]]; then BASE="$MG_BASE"
elif [[ "$EVENT" == pull_request ]]; then git fetch origin "$BASE_REF" --no-tags; BASE="origin/$BASE_REF"
elif [[ -n "$BEFORE" && "$BEFORE" != 0000000000000000000000000000000000000000 ]]; then BASE="$BEFORE"
else BASE="HEAD^1"; fi
mapfile -t PATHSPECS < <(grep -v '^#' .github/viewport-sweep-paths.txt)
CHANGED="$(git diff --diff-filter=ACDMRT --name-only --no-renames "$BASE" HEAD -- "${PATHSPECS[@]}")"
echo "run=$([[ -n "$CHANGED" ]] && echo true || echo false)" >> "$GITHUB_OUTPUT"
