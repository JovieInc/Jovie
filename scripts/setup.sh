#!/usr/bin/env bash
# scripts/setup.sh — Idempotent dev environment bootstrap for Jovie
# Safe to run multiple times. Works on macOS, Linux, and Git Bash / WSL on Windows.
set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RESET='\033[0m'

warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
success() { echo -e "${GREEN}✅ $*${RESET}"; }
info()    { echo "   $*"; }

MISSING=()

# ─── 1. Node.js version check ───────────────────────────────────────────────
echo ""
echo "── Node.js ─────────────────────────────────────────────────────────────"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
  if [[ "$NODE_MAJOR" == "22" ]]; then
    success "Node.js $NODE_VERSION (22.x ✓)"
  else
    warn "Node.js $NODE_VERSION detected — MUST be 22.x (22.13+)"
    info "Fix: nvm use 22  (or: nvm install 22)"
    MISSING+=("Node.js 22.x")
  fi
else
  warn "Node.js not found"
  info "Install via nvm: https://github.com/nvm-sh/nvm"
  MISSING+=("Node.js 22.x")
fi

# ─── 2. pnpm ────────────────────────────────────────────────────────────────
echo ""
echo "── pnpm ────────────────────────────────────────────────────────────────"
REQUIRED_PNPM="9.15.4"
if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version)
  if [[ "$PNPM_VERSION" == "$REQUIRED_PNPM" ]]; then
    success "pnpm $PNPM_VERSION (exact match ✓)"
  else
    warn "pnpm $PNPM_VERSION detected — MUST be $REQUIRED_PNPM (exact)"
    info "Fixing via corepack..."
    corepack enable && corepack prepare "pnpm@$REQUIRED_PNPM" --activate
    success "pnpm updated to $REQUIRED_PNPM"
  fi
else
  info "pnpm not found — installing via corepack..."
  corepack enable && corepack prepare "pnpm@$REQUIRED_PNPM" --activate
  if command -v pnpm &>/dev/null; then
    success "pnpm $REQUIRED_PNPM installed"
  else
    warn "corepack install failed — try: npm install -g pnpm@$REQUIRED_PNPM"
    MISSING+=("pnpm $REQUIRED_PNPM")
  fi
fi

# ─── 3. Doppler CLI ─────────────────────────────────────────────────────────
echo ""
echo "── Doppler CLI ─────────────────────────────────────────────────────────"
if command -v doppler &>/dev/null; then
  success "Doppler CLI $(doppler --version 2>/dev/null | head -1)"
else
  warn "Doppler CLI not found — installing..."
  OS="$(uname -s 2>/dev/null || echo Windows)"
  case "$OS" in
    Darwin)
      if command -v brew &>/dev/null; then
        info "Installing via Homebrew..."
        brew install dopplerhq/cli/doppler
      else
        info "Installing via curl (macOS)..."
        curl -Lsf https://cli.doppler.com/install.sh | sh
      fi
      ;;
    Linux)
      info "Installing via curl (Linux)..."
      curl -Lsf https://cli.doppler.com/install.sh | sh
      ;;
    Windows* | MINGW* | MSYS* | CYGWIN*)
      warn "Windows detected — install Doppler manually:"
      info "  PowerShell: (Invoke-WebRequest -Uri 'https://cli.doppler.com/install.ps1' -UseBasicParsing).Content | powershell"
      MISSING+=("Doppler CLI")
      ;;
    *)
      info "Unknown OS ($OS) — trying curl installer..."
      curl -Lsf https://cli.doppler.com/install.sh | sh || {
        warn "Auto-install failed. Visit: https://docs.doppler.com/docs/install-cli"
        MISSING+=("Doppler CLI")
      }
      ;;
  esac
  if command -v doppler &>/dev/null; then
    success "Doppler CLI installed"
  fi
fi

# ─── 4. pnpm install ────────────────────────────────────────────────────────
echo ""
echo "── Dependencies ────────────────────────────────────────────────────────"
if command -v pnpm &>/dev/null; then
  info "Running pnpm install..."
  pnpm install
  success "Dependencies installed"
else
  warn "Skipping pnpm install — pnpm not available"
  MISSING+=("pnpm install")
fi

# ─── 5. Doppler auth / config check ─────────────────────────────────────────
echo ""
echo "── Doppler auth ────────────────────────────────────────────────────────"
if ! command -v doppler &>/dev/null; then
  warn "Skipping Doppler auth check — CLI not installed"
else
  CI="${CI:-false}"
  if [[ "$CI" == "true" ]]; then
    # CI mode: use DOPPLER_TOKEN env var
    if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
      success "CI mode: DOPPLER_TOKEN is set"
      info "Use: doppler run --token \"\$DOPPLER_TOKEN\" -- <command>"
    else
      warn "CI=true but DOPPLER_TOKEN is not set"
      info "Set DOPPLER_TOKEN to a Doppler service token for this project"
      MISSING+=("DOPPLER_TOKEN env var")
    fi
  else
    # Interactive mode: check if doppler is configured and working
    if doppler run -- echo "doppler-ok" &>/dev/null 2>&1; then
      success "Doppler is authenticated and configured"
    else
      # Try to check configure state without running a command
      if doppler configure get token &>/dev/null 2>&1; then
        warn "Doppler has a token but project config may be missing"
        info "Run: doppler setup --project jovie-web --config dev"
      else
        warn "Doppler is not authenticated"
        echo ""
        echo "  To authenticate:"
        echo "    doppler login"
        echo "    doppler setup --project jovie-web --config dev"
        echo ""
        echo "  Then prefix ALL commands with: doppler run --"
        echo "    doppler run -- pnpm test"
        echo "    doppler run -- pnpm run dev:local"
        MISSING+=("Doppler auth (run: doppler login)")
      fi
    fi
  fi
fi

# ─── Final status ────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────────────────"
if [[ ${#MISSING[@]} -eq 0 ]]; then
  success "Ready to develop"
  echo ""
  echo "  Start the dev server:"
  echo "    doppler run -- pnpm --filter web dev:local"
  echo ""
  echo "  Run tests:"
  echo "    doppler run -- pnpm vitest run"
else
  warn "Missing: $(IFS=', '; echo "${MISSING[*]}")"
  echo "  See instructions above to resolve each item, then re-run: ./scripts/setup.sh"
fi
echo ""
