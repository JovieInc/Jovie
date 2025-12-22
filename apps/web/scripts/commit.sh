#!/bin/bash

# Simple commit helper for conventional commits
# Usage: ./scripts/commit.sh or pnpm commit

echo "🚀 Conventional Commit Helper"
echo ""
echo "Available types:"
echo "  feat:     New feature"
echo "  fix:      Bug fix" 
echo "  chore:    Maintenance/tooling changes"
echo "  docs:     Documentation only"
echo "  style:    Formatting, no code change"
echo "  refactor: Code restructuring"
echo "  perf:     Performance improvement"
echo "  test:     Adding/fixing tests"
echo "  ci:       CI/CD changes"
echo ""

# Get commit type
read -p "Enter commit type: " type

# Get commit subject
read -p "Enter commit subject (max 50 chars): " subject

# Get commit body (optional)
read -p "Enter commit body (optional, press Enter to skip): " body

# Build commit message
commit_msg="${type}: ${subject}"

if [[ ! -z "$body" ]]; then
  # Wrap body text to 72 characters per line
  wrapped_body=$(echo "$body" | fold -s -w 72)
  commit_msg="${commit_msg}

${wrapped_body}"
fi

# Add standard footer
commit_msg="${commit_msg}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

echo ""
echo "Commit message:"
echo "=================="
echo "$commit_msg"
echo "=================="
echo ""

read -p "Commit with this message? (y/N): " confirm
if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
  git commit -m "$commit_msg"
  echo "✅ Committed successfully!"
else
  echo "❌ Commit cancelled"
fi