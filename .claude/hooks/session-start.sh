#!/bin/bash
# Session start hook - ensures cloud environments are properly set up
# This runs automatically when a Claude Code session starts

set -e

# Determine project directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR"

echo "Setting up Claude Code environment..."

# 1. Install dependencies if node_modules is missing or empty
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "Installing dependencies (this may take a moment on first run)..."

  # Check if pnpm is available
  if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    corepack enable 2>/dev/null || npm install -g pnpm@9.15.4
  fi

  # Install with frozen lockfile for reproducibility
  pnpm install --frozen-lockfile
  echo "Dependencies installed."
else
  echo "Dependencies already installed."
fi

# 2. Make hook scripts executable
chmod +x "$PROJECT_DIR"/.claude/hooks/*.sh 2>/dev/null || true

# 3. Verify critical tools
echo ""
echo "Environment status:"
echo "  Node.js: $(node --version 2>/dev/null || echo 'not found')"
echo "  pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo "  jq: $(jq --version 2>/dev/null || echo 'not installed (hooks will use fallbacks)')"
echo "  Biome: $(pnpm exec biome --version 2>/dev/null || echo 'run pnpm install first')"

# 4. Check for node_modules/.bin in PATH
if [ -d "node_modules/.bin" ]; then
  echo "  Local binaries: available"
else
  echo "  Local binaries: not found (run pnpm install)"
fi

echo ""
echo "Claude Code environment ready."
