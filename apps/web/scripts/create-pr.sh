#!/bin/bash

# Helper script for creating PRs with auto-merge label
# Usage: ./scripts/create-pr.sh "PR Title" "PR Body"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 'PR Title' 'PR Body'"
  echo "Example: $0 'feat: add user auth' 'Implement OAuth login with Google'"
  exit 1
fi

TITLE="$1"
BODY="$2"

echo "🚀 Creating PR with auto-merge label..."
echo "Title: $TITLE"
echo ""

# Create PR and capture the URL
PR_URL=$(gh pr create --title "$TITLE" --body "$BODY")

if [[ $? -eq 0 ]]; then
  echo "✅ PR created: $PR_URL"
  
  # Extract PR number from URL
  PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')
  
  echo "🏷️ Adding auto-merge label..."
  
  # Add the auto-merge label
  gh pr edit "$PR_NUMBER" --add-label "auto-merge"
  
  if [[ $? -eq 0 ]]; then
    echo "✅ auto-merge label added to PR #$PR_NUMBER"
    echo "🔄 Auto-merge will be enabled when CI passes"
  else
    echo "⚠️ Failed to add auto-merge label, you can add it manually"
  fi
  
  echo ""
  echo "PR URL: $PR_URL"
else
  echo "❌ Failed to create PR"
  exit 1
fi