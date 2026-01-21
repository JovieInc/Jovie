#!/bin/bash
# Session start hook - ensures cloud environments are properly set up
# This runs automatically when a Claude Code session starts

set -e

# Determine project directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR"

echo "=============================================="
echo "  Jovie Development Environment Setup"
echo "=============================================="
echo ""

# 0. CRITICAL: Verify Node.js version FIRST
REQUIRED_NODE_MAJOR=24
CURRENT_NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
CURRENT_NODE_MAJOR=$(echo "$CURRENT_NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')

if [ "$CURRENT_NODE_VERSION" = "not found" ]; then
  echo "ERROR: Node.js is not installed!"
  echo ""
  echo "This project REQUIRES Node.js 24. Install it with:"
  echo "  nvm install 24 && nvm use 24"
  echo ""
  exit 1
fi

if [ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
  echo "WARNING: Wrong Node.js version detected!"
  echo ""
  echo "  Current:  $CURRENT_NODE_VERSION"
  echo "  Required: v24.0.0 or higher"
  echo ""
  echo "To fix, run:"
  echo "  nvm install 24 && nvm use 24"
  echo ""
  echo "Or if using .nvmrc:"
  echo "  nvm use"
  echo ""
  echo "Continuing anyway, but commands may fail..."
  echo ""
fi

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
echo "=============================================="
echo "  Environment Status"
echo "=============================================="
NODE_VER=$(node --version 2>/dev/null || echo 'not found')
PNPM_VER=$(pnpm --version 2>/dev/null || echo 'not found')

# Check if versions match requirements
NODE_OK="[OK]"
PNPM_OK="[OK]"
if [ "$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')" -lt 24 ] 2>/dev/null; then
  NODE_OK="[WRONG - need v24+]"
fi
if [ "$PNPM_VER" != "9.15.4" ] && [ "$PNPM_VER" != "not found" ]; then
  PNPM_OK="[WRONG - need 9.15.4]"
fi

echo "  Node.js: $NODE_VER $NODE_OK"
echo "  pnpm:    $PNPM_VER $PNPM_OK"
echo "  jq:      $(jq --version 2>/dev/null || echo 'not installed (hooks will use fallbacks)')"
echo "  Biome:   $(pnpm exec biome --version 2>/dev/null || echo 'run pnpm install first')"

# 4. Check for node_modules/.bin in PATH
if [ -d "node_modules/.bin" ]; then
  echo "  Binaries: available"
else
  echo "  Binaries: not found (run pnpm install)"
fi

echo ""
echo "=============================================="
echo "  IMPORTANT REMINDERS"
echo "=============================================="
echo "  - Use 'pnpm' not 'npm' or 'yarn'"
echo "  - Run commands from repo root (not apps/web)"
echo "  - Use 'pnpm --filter web <cmd>' for web-specific tasks"
echo "  - See agents.md for full AI agent guidelines"
echo "=============================================="
echo ""
echo "Claude Code environment ready."
