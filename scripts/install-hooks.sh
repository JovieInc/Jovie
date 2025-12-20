#!/usr/bin/env sh
set -e

# Install native Git hooks
# This script symlinks hooks from scripts/hooks/ to .git/hooks/

HOOKS_DIR="scripts/hooks"
GIT_HOOKS_DIR=".git/hooks"

if [ ! -d "$GIT_HOOKS_DIR" ]; then
  echo "Error: .git/hooks directory not found. Are you in a Git repository?"
  exit 1
fi

if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: $HOOKS_DIR directory not found."
  exit 1
fi

echo "Installing Git hooks..."

for hook in pre-commit commit-msg pre-push; do
  if [ -f "$HOOKS_DIR/$hook" ]; then
    # Remove existing hook if it exists
    if [ -f "$GIT_HOOKS_DIR/$hook" ] || [ -L "$GIT_HOOKS_DIR/$hook" ]; then
      rm "$GIT_HOOKS_DIR/$hook"
    fi
    
    # Create symlink
    ln -s "../../$HOOKS_DIR/$hook" "$GIT_HOOKS_DIR/$hook"
    chmod +x "$GIT_HOOKS_DIR/$hook"
    echo "  ✓ Installed $hook"
  fi
done

echo "Git hooks installed successfully!"


