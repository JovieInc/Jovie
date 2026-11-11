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

# 0. Put the repo's pinned Node first on PATH, fetching it when the session
# started on another one, so no check runs on the wrong Node.
if [ -f "$PROJECT_DIR/scripts/lib/setup-worktree-health.sh" ]; then
  . "$PROJECT_DIR/scripts/lib/setup-worktree-health.sh"
  if ! jovie_setup_ensure_pinned_node "$PROJECT_DIR"; then
    echo "ERROR: could not fetch Node $(cat "$PROJECT_DIR/.nvmrc") from nodejs.org."
  fi
fi

# 0.1. Verify Node.js version
REQUIRED_NODE_MAJOR=$(cat "$PROJECT_DIR/.nvmrc" 2>/dev/null | cut -d. -f1)
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-24}"
CURRENT_NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
CURRENT_NODE_MAJOR=$(echo "$CURRENT_NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')

if [ "$CURRENT_NODE_VERSION" = "not found" ]; then
  echo "ERROR: Node.js is not installed!"
  echo ""
  echo "This project REQUIRES Node.js ${REQUIRED_NODE_MAJOR}. Install it with:"
  echo "  nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}"
  echo ""
  exit 1
fi

if [ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
  echo "ERROR: Wrong Node.js version detected! Checks run on it will not match CI."
  echo ""
  echo "  Current:  $CURRENT_NODE_VERSION"
  echo "  Required: v${REQUIRED_NODE_MAJOR}.x"
  echo ""
  echo "To fix, run:"
  echo "  nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR}"
  echo ""
  echo "Or if using .nvmrc:"
  echo "  nvm use"
  echo ""
  echo "Continuing anyway, but commands may fail..."
  echo ""
fi

echo "Setting up Claude Code environment..."

if [ -x "$PROJECT_DIR/scripts/setup.sh" ]; then
  # setup.sh cheap-exits when the worktree is already healthy (deps
  # fingerprint matches and Node/pnpm pins are ok). Cold/stale worktrees
  # still run the full bootstrap.
  echo "Running ./scripts/setup.sh to normalize this worktree..."
  # A cloud session cannot install every laptop tool (Doppler, for one), and
  # setup.sh exits 1 on any missing one. Keep going, so dependencies and the
  # Playwright browser below still get set up.
  if ! "$PROJECT_DIR/scripts/setup.sh"; then
    echo "WARNING: scripts/setup.sh reported missing tools (listed above); continuing."
  fi
fi

# 0.5. Verify GitHub CLI availability
if ! command -v gh &> /dev/null; then
  echo "WARNING: GitHub CLI is not installed."
  echo "Install it manually before using GitHub automation:"
  echo "  macOS: brew install gh"
  echo "  Linux: https://github.com/cli/cli#installation"
else
  echo "GitHub CLI already installed."
fi

# 1. Install dependencies if node_modules is missing or empty
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "Installing dependencies (this may take a moment on first run)..."

  # Check if pnpm is available
  if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    corepack enable 2>/dev/null
    corepack prepare pnpm@9.15.9 --activate
  fi

  # Install with frozen lockfile for reproducibility
  pnpm install --frozen-lockfile
  echo "Dependencies installed."
else
  echo "Dependencies already installed."
fi

# 1.5. Playwright Chromium (cloud sessions): ready it for screenshots and e2e,
# or say why it cannot be, before work that needs it starts.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && command -v jovie_setup_playwright_chromium >/dev/null 2>&1; then
  jovie_setup_playwright_chromium "$PROJECT_DIR"
fi

# 2. Make hook scripts executable
chmod +x "$PROJECT_DIR"/.claude/hooks/*.sh 2>/dev/null || true

# 2.5. Install Bun if not available (required by gstack)
if ! command -v bun &> /dev/null; then
  echo "WARNING: Bun runtime is not installed. gstack browser skills will not work."
  echo "Install Bun manually before using those skills: https://bun.sh/docs/installation"
fi

# 2.6. Initialize gstack skills if submodule is present
if [ -f "$PROJECT_DIR/.claude/skills/gstack/setup" ]; then
  echo "Initializing gstack skills..."
  (cd "$PROJECT_DIR/.claude/skills/gstack" && bash ./setup 2>&1) || echo "WARNING: gstack setup had issues (browser skills may need manual setup)"
fi

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
if [ "$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')" -lt "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
  NODE_OK="[WRONG - need v${REQUIRED_NODE_MAJOR}+]"
fi
if [ "$PNPM_VER" != "9.15.9" ] && [ "$PNPM_VER" != "not found" ]; then
  PNPM_OK="[WRONG - need 9.15.9]"
fi

echo "  Node.js: $NODE_VER $NODE_OK"
echo "  pnpm:    $PNPM_VER $PNPM_OK"
echo "  jq:      $(jq --version 2>/dev/null || echo 'not installed (hooks will use fallbacks)')"
echo "  gh CLI:  $(gh --version 2>/dev/null | head -1 || echo 'not installed')"
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
echo "  - See AGENTS.md for full AI agent guidelines"
echo "=============================================="
echo ""
echo "Claude Code environment ready."
