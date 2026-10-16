#!/usr/bin/env bash
# Resolve the high-risk files Mutation Diff should score.
# Diff from the last successful push run so a failed or dropped run is retried.
# A merge-queue push carries several PRs, so this uses the compare API.
set -euo pipefail

if [ "$EVENT" = workflow_dispatch ]; then
  files="$INPUT_FILES"
else
  base="$(gh api "repos/$REPO/actions/workflows/mutation-diff.yml/runs?branch=main&event=push&status=success&per_page=1" \
    --jq '.workflow_runs[0].head_sha // empty')"
  base="${base:-$BEFORE}"
  if [ -z "$base" ] || [[ "$base" =~ ^0+$ ]]; then
    echo "::notice::No baseline commit to diff against; skipping."
    files=""
  else
    echo "Diffing $base...$HEAD_SHA"
    files="$(gh api "repos/$REPO/compare/$base...$HEAD_SHA" \
      --jq '[.files[] | select(.status != "removed") | .filename] | join(" ")')"
  fi
fi
echo "files=$files" >> "$GITHUB_OUTPUT"
