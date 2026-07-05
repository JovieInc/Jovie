#!/usr/bin/env bash
# Idempotent PR comment: keep ONE comment per (PR, marker) and edit it in place
# on repeat runs instead of posting a fresh comment every time. This stops
# status/guard workflows from spamming a PR with dozens of identical comments.
#
# Usage: upsert-pr-comment.sh <pr_number> <marker> <body>
#   <marker> is a short stable slug, e.g. "ci-branching-guard". It is embedded
#   as a hidden HTML comment so the comment can be found and updated later.
#
# Requires: gh CLI authenticated; GITHUB_REPOSITORY (defaults to JovieInc/Jovie).
set -euo pipefail

pr_number="${1:?pr number required}"
marker="${2:?marker required}"
body="${3:?body required}"
repo="${GITHUB_REPOSITORY:-JovieInc/Jovie}"

hidden="<!-- bot-comment:${marker} -->"
full_body="${hidden}
${body}"

existing_id=$(gh api "repos/${repo}/issues/${pr_number}/comments" --paginate \
  --jq ".[] | select(.body | contains(\"${hidden}\")) | .id" 2>/dev/null | head -1)

if [ -n "${existing_id}" ]; then
  gh api -X PATCH "repos/${repo}/issues/comments/${existing_id}" \
    -f body="${full_body}" >/dev/null
else
  gh pr comment "${pr_number}" --body "${full_body}" >/dev/null
fi
