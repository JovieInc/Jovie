#!/usr/bin/env bash
# Idempotent PR comment: keep ONE comment per (PR, marker) and edit it in place
# on repeat runs instead of posting a fresh comment every time. This stops
# status/guard workflows from spamming a PR with dozens of identical comments.
#
# Usage: upsert-pr-comment.sh <pr_number> <marker> <body> [dedupe_key]
#   <marker> is a short stable slug, e.g. "ci-branching-guard". It is embedded
#   as a hidden HTML comment so the comment can be found and updated later.
#
# Requires: gh CLI authenticated; GITHUB_REPOSITORY (defaults to JovieInc/Jovie).
set -euo pipefail

pr_number="${1:?pr number required}"
marker="${2:?marker required}"
body="${3:?body required}"
dedupe_key="${4:-}"
repo="${GITHUB_REPOSITORY:-JovieInc/Jovie}"
trusted_authors_json="${BOT_COMMENT_TRUSTED_AUTHORS_JSON:-}"

if [[ -n "${trusted_authors_json}" ]] \
  && ! jq -e 'type == "array" and all(.[]; type == "string" and length > 0)' \
    <<<"${trusted_authors_json}" >/dev/null; then
  echo "BOT_COMMENT_TRUSTED_AUTHORS_JSON must be a JSON array of logins" >&2
  exit 2
fi

hidden="<!-- bot-comment:${marker} -->"
dedupe_hidden=""
if [ -n "${dedupe_key}" ]; then
  dedupe_hidden="<!-- bot-comment-dedupe:${dedupe_key} -->"
fi
full_body="${hidden}
${dedupe_hidden}
${body}"

comments=$(gh api "repos/${repo}/issues/${pr_number}/comments" --paginate --slurp 2>/dev/null)
comments="${comments:-[]}"
existing=$(jq -c --arg hidden "${hidden}" --argjson trusted "${trusted_authors_json:-[]}" '
  def comments:
    if type != "array" then []
    elif length == 0 then []
    elif (.[0] | type) == "array" then add
    else .
    end;
  comments
  | map(select(
      ((.body // "") | contains($hidden)) and
      (($trusted | length) == 0 or (.user.login as $login | $trusted | index($login)) != null)
    ))
  | first // empty
' <<<"${comments}")
existing_id=""
if [ -n "${existing}" ]; then
  existing_id=$(jq -r '.id // empty' <<<"${existing}")
fi

if [ -n "${existing_id}" ]; then
  if [ -n "${dedupe_hidden}" ] \
    && jq -e --arg marker "${dedupe_hidden}" '.body | contains($marker)' \
      <<<"${existing}" >/dev/null; then
    exit 0
  fi
  gh api -X PATCH "repos/${repo}/issues/comments/${existing_id}" \
    -f body="${full_body}" >/dev/null
else
  gh pr comment "${pr_number}" --body "${full_body}" >/dev/null
fi
