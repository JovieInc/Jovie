#!/usr/bin/env bash
# ==============================================================================
# fetch-review.sh - Fetch CodeRabbit review data from GitHub API
#
# PURPOSE:
# Retrieves the review body and inline comments from a CodeRabbit review,
# formats them into structured data for the autofix agent.
#
# USAGE:
#   ./fetch-review.sh <repo> <pr_number> <review_id>
#
# OUTPUTS:
#   - Writes review body to stdout (base64 encoded)
#   - Writes inline comments JSON to stderr (base64 encoded)
#   - Exit code 0 on success, 1 on failure
#
# REQUIRES:
#   - gh CLI authenticated
#   - jq for JSON processing
# ==============================================================================

set -euo pipefail

# Validate arguments
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <repo> <pr_number> <review_id>" >&2
  exit 1
fi

REPO="$1"
PR_NUMBER="$2"
REVIEW_ID="$3"

echo "Fetching review $REVIEW_ID for PR #$PR_NUMBER in $REPO" >&2

# Fetch review body
REVIEW_BODY=$(gh api "repos/$REPO/pulls/$PR_NUMBER/reviews/$REVIEW_ID" --jq '.body // ""')

if [[ -z "$REVIEW_BODY" ]]; then
  echo "Warning: Review body is empty" >&2
fi

# Fetch inline comments for this review
# Returns array of {path, line, body} objects
INLINE_COMMENTS=$(gh api "repos/$REPO/pulls/$PR_NUMBER/reviews/$REVIEW_ID/comments" \
  --jq '[.[] | {path: .path, line: (.line // .original_line // 0), body: .body}]')

COMMENT_COUNT=$(echo "$INLINE_COMMENTS" | jq 'length')
echo "Found $COMMENT_COUNT inline comments" >&2

# Output as base64 to handle multiline strings and special characters
echo "REVIEW_BODY_B64=$(echo "$REVIEW_BODY" | base64 -w0)"
echo "INLINE_COMMENTS_B64=$(echo "$INLINE_COMMENTS" | base64 -w0)"
