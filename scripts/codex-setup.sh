#!/usr/bin/env bash
#
# Codex Worktree Setup Script
# ============================
# This script sets up a fresh worktree with all dependencies for the Jovie monorepo.
# Run this automatically on every worktree creation.
#
# Requirements:
#   - Node.js 24.x
#   - pnpm 9.15.4 (exact)
#   - Doppler CLI (for secrets)
#
# Usage:
#   ./scripts/codex-setup.sh
#   # Or with Doppler token:
#   DOPPLER_TOKEN=dp.st.xxx ./scripts/codex-setup.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==============================================================================
# Configuration
# ==============================================================================
REQUIRED_NODE_MAJOR=24
REQUIRED_PNPM_VERSION="9.15.4"
DOPPLER_PROJECT="${DOPPLER_PROJECT:-jovie}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-dev}"

# ==============================================================================
# Helper Functions
# ==============================================================================

check_command() {
  command -v "$1" &> /dev/null
}

get_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

# ==============================================================================
# Node.js Setup
# ==============================================================================

setup_node() {
  log_info "Checking Node.js version..."

  # Check if Node is installed and correct version
  if check_command node; then
    NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
    if [[ "$NODE_VERSION" -eq "$REQUIRED_NODE_MAJOR" ]]; then
      log_success "Node.js v$(node --version | sed 's/v//') is installed"
      return 0
    fi
  fi

  log_warn "Node.js ${REQUIRED_NODE_MAJOR}.x required, installing..."

  # Try nvm first
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh"
    nvm install ${REQUIRED_NODE_MAJOR}
    nvm use ${REQUIRED_NODE_MAJOR}
    log_success "Node.js ${REQUIRED_NODE_MAJOR} installed via nvm"
    return 0
  fi

  # Try fnm
  if check_command fnm; then
    fnm install ${REQUIRED_NODE_MAJOR}
    fnm use ${REQUIRED_NODE_MAJOR}
    log_success "Node.js ${REQUIRED_NODE_MAJOR} installed via fnm"
    return 0
  fi

  # Try n
  if check_command n; then
    n ${REQUIRED_NODE_MAJOR}
    log_success "Node.js ${REQUIRED_NODE_MAJOR} installed via n"
    return 0
  fi

  # Try Homebrew (macOS)
  if [[ "$(get_os)" == "macos" ]] && check_command brew; then
    brew install node@${REQUIRED_NODE_MAJOR}
    brew link --overwrite node@${REQUIRED_NODE_MAJOR}
    log_success "Node.js ${REQUIRED_NODE_MAJOR} installed via Homebrew"
    return 0
  fi

  # Fallback: Install nvm and then Node
  log_info "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install ${REQUIRED_NODE_MAJOR}
  nvm use ${REQUIRED_NODE_MAJOR}
  log_success "Node.js ${REQUIRED_NODE_MAJOR} installed via nvm"
}

# ==============================================================================
# pnpm Setup
# ==============================================================================

setup_pnpm() {
  log_info "Setting up pnpm ${REQUIRED_PNPM_VERSION}..."

  # Enable corepack (built into Node.js)
  corepack enable 2>/dev/null || {
    log_warn "corepack enable failed, trying with sudo..."
    sudo corepack enable || true
  }

  # Prepare specific pnpm version
  corepack prepare pnpm@${REQUIRED_PNPM_VERSION} --activate

  # Verify
  INSTALLED_PNPM=$(pnpm --version 2>/dev/null || echo "none")
  if [[ "$INSTALLED_PNPM" == "$REQUIRED_PNPM_VERSION" ]]; then
    log_success "pnpm ${REQUIRED_PNPM_VERSION} is ready"
  else
    log_error "pnpm version mismatch: got ${INSTALLED_PNPM}, expected ${REQUIRED_PNPM_VERSION}"
    exit 1
  fi
}

# ==============================================================================
# Doppler Setup
# ==============================================================================

setup_doppler() {
  log_info "Setting up Doppler CLI..."

  if check_command doppler; then
    log_success "Doppler CLI is already installed ($(doppler --version))"
  else
    log_info "Installing Doppler CLI..."

    OS=$(get_os)
    case "$OS" in
      macos)
        if check_command brew; then
          brew install dopplerhq/cli/doppler
        else
          log_error "Homebrew required for macOS Doppler installation"
          exit 1
        fi
        ;;
      linux)
        # Debian/Ubuntu
        if check_command apt-get; then
          sudo apt-get update
          sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
          curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
            'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
            sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
          echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | \
            sudo tee /etc/apt/sources.list.d/doppler-cli.list
          sudo apt-get update && sudo apt-get install -y doppler
        # RHEL/CentOS/Fedora
        elif check_command yum || check_command dnf; then
          sudo rpm --import 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key'
          curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
            'https://packages.doppler.com/public/cli/config.rpm.txt' | \
            sudo tee /etc/yum.repos.d/doppler-cli.repo
          sudo yum update -y && sudo yum install -y doppler
        # Alpine
        elif check_command apk; then
          sudo apk add --no-cache curl gnupg
          curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
            'https://packages.doppler.com/public/cli/setup.sh' | sudo sh
        else
          log_error "Unsupported Linux distribution for Doppler installation"
          exit 1
        fi
        ;;
      *)
        log_error "Unsupported OS for Doppler installation"
        exit 1
        ;;
    esac

    log_success "Doppler CLI installed ($(doppler --version))"
  fi

  # Configure Doppler
  if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
    log_info "Configuring Doppler with provided token..."
    echo "$DOPPLER_TOKEN" | doppler configure set token --scope /
    log_success "Doppler configured with token"
  elif doppler configure get token --plain &>/dev/null; then
    log_success "Doppler already configured"
  else
    log_warn "Doppler not configured. Set DOPPLER_TOKEN or run: doppler login"
    log_info "  Project: ${DOPPLER_PROJECT}"
    log_info "  Config:  ${DOPPLER_CONFIG}"
  fi

  # Set project/config if token is available
  if doppler configure get token --plain &>/dev/null || [[ -n "${DOPPLER_TOKEN:-}" ]]; then
    doppler setup --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" --no-interactive 2>/dev/null || {
      log_warn "Could not auto-configure Doppler project. Run manually:"
      log_info "  doppler setup --project ${DOPPLER_PROJECT} --config ${DOPPLER_CONFIG}"
    }
  fi
}

# ==============================================================================
# Dependencies Installation
# ==============================================================================

install_dependencies() {
  log_info "Installing project dependencies..."

  # Navigate to repo root (in case we're in a subdirectory)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  cd "$REPO_ROOT"

  # Install dependencies
  pnpm install --frozen-lockfile || pnpm install

  log_success "Dependencies installed"
}

# ==============================================================================
# Verification
# ==============================================================================

verify_setup() {
  log_info "Verifying setup..."

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "                         SETUP VERIFICATION"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Node.js
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -eq "$REQUIRED_NODE_MAJOR" ]]; then
    echo -e "  Node.js:     ${GREEN}✓${NC} ${NODE_VER}"
  else
    echo -e "  Node.js:     ${RED}✗${NC} ${NODE_VER} (expected v${REQUIRED_NODE_MAJOR}.x)"
  fi

  # pnpm
  PNPM_VER=$(pnpm --version)
  if [[ "$PNPM_VER" == "$REQUIRED_PNPM_VERSION" ]]; then
    echo -e "  pnpm:        ${GREEN}✓${NC} ${PNPM_VER}"
  else
    echo -e "  pnpm:        ${RED}✗${NC} ${PNPM_VER} (expected ${REQUIRED_PNPM_VERSION})"
  fi

  # Doppler
  if check_command doppler; then
    DOPPLER_VER=$(doppler --version 2>&1 | head -1)
    if doppler configure get token --plain &>/dev/null; then
      echo -e "  Doppler:     ${GREEN}✓${NC} ${DOPPLER_VER} (authenticated)"
    else
      echo -e "  Doppler:     ${YELLOW}⚠${NC} ${DOPPLER_VER} (not authenticated)"
    fi
  else
    echo -e "  Doppler:     ${RED}✗${NC} not installed"
  fi

  # Turbo
  if [[ -f "node_modules/.bin/turbo" ]]; then
    TURBO_VER=$(./node_modules/.bin/turbo --version 2>/dev/null || echo "unknown")
    echo -e "  Turbo:       ${GREEN}✓${NC} ${TURBO_VER}"
  else
    echo -e "  Turbo:       ${RED}✗${NC} not found"
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

# ==============================================================================
# Main
# ==============================================================================

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║                    JOVIE CODEX WORKTREE SETUP                        ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""

  setup_node
  setup_pnpm
  setup_doppler
  install_dependencies
  verify_setup

  echo ""
  log_success "Setup complete! You can now run:"
  echo ""
  echo "  pnpm --filter web dev      # Start dev server (with Doppler)"
  echo "  pnpm turbo build           # Build all packages"
  echo "  pnpm turbo typecheck       # Type check all packages"
  echo ""
}

main "$@"
