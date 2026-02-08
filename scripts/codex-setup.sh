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
#   # Or with Doppler service token:
#   DOPPLER_TOKEN=dp.st.xxx ./scripts/codex-setup.sh
#
# How Doppler auth works:
#   - Service tokens: Set DOPPLER_TOKEN env var (Codex passes this automatically).
#     The Doppler CLI reads DOPPLER_TOKEN from the environment — no explicit config needed.
#   - Interactive: Run `doppler login` then `doppler setup` manually.
#   - This script generates apps/web/.env.local from Doppler so Next.js and tests
#     can access secrets without the `doppler run --` wrapper.

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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REQUIRED_NODE_VERSION="$(cat "${REPO_ROOT}/.nvmrc" 2>/dev/null || echo "24")"
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_VERSION%%.*}"
REQUIRED_PNPM_VERSION="9.15.4"
DOPPLER_PROJECT="${DOPPLER_PROJECT:-jovie-web}"
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
  log_info "Checking Node.js version (required: ${REQUIRED_NODE_VERSION})..."

  # Check if Node is installed and correct version
  if check_command node; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR="${NODE_VERSION%%.*}"
    if [[ "$NODE_VERSION" == "$REQUIRED_NODE_VERSION" || "$NODE_MAJOR" -eq "$REQUIRED_NODE_MAJOR" ]]; then
      log_success "Node.js v${NODE_VERSION} is installed"
      return 0
    fi
  fi

  log_warn "Node.js ${REQUIRED_NODE_VERSION} required, installing..."

  # Try nvm first
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
    nvm install "${REQUIRED_NODE_VERSION}"
    nvm use "${REQUIRED_NODE_VERSION}"
    log_success "Node.js ${REQUIRED_NODE_VERSION} installed via nvm"
    return 0
  fi

  # Try fnm
  if check_command fnm; then
    fnm install "${REQUIRED_NODE_VERSION}"
    fnm use "${REQUIRED_NODE_VERSION}"
    log_success "Node.js ${REQUIRED_NODE_VERSION} installed via fnm"
    return 0
  fi

  # Try n
  if check_command n; then
    n "${REQUIRED_NODE_VERSION}"
    log_success "Node.js ${REQUIRED_NODE_VERSION} installed via n"
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
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install "${REQUIRED_NODE_VERSION}"
  nvm use "${REQUIRED_NODE_VERSION}"
  log_success "Node.js ${REQUIRED_NODE_VERSION} installed via nvm"
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

  # Determine if Doppler has credentials available.
  # Priority: DOPPLER_TOKEN env var (service token) > CLI config token (interactive login)
  local has_token=false
  if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
    has_token=true
    log_success "Doppler authenticated via DOPPLER_TOKEN env var"
  elif doppler configure get token --plain &>/dev/null; then
    has_token=true
    log_success "Doppler authenticated via CLI config"
  fi

  if [[ "$has_token" == "false" ]]; then
    log_warn "Doppler not configured. Set DOPPLER_TOKEN or run: doppler login"
    log_info "  Project: ${DOPPLER_PROJECT}"
    log_info "  Config:  ${DOPPLER_CONFIG}"
    return 0
  fi

  # Configure project/config scope for this directory.
  # When DOPPLER_TOKEN is set, doppler run/secrets commands auto-authenticate via env var,
  # but doppler setup still needs to run to set the project/config scope.
  doppler setup --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" --no-interactive 2>/dev/null || {
    log_warn "Could not auto-configure Doppler project. Run manually:"
    log_info "  doppler setup --project ${DOPPLER_PROJECT} --config ${DOPPLER_CONFIG}"
  }
}

# ==============================================================================
# Generate .env.local from Doppler
# ==============================================================================

generate_env_local() {
  log_info "Generating .env.local from Doppler secrets..."

  local env_file="${REPO_ROOT}/apps/web/.env.local"

  # Check if Doppler can fetch secrets
  if ! doppler secrets download --no-file --format env-no-quotes &>/dev/null; then
    log_warn "Cannot fetch Doppler secrets. Skipping .env.local generation."
    log_info "  Commands using 'doppler run --' will still work if Doppler is configured."
    return 0
  fi

  # Write header + secrets to .env.local
  {
    echo "# Generated by codex-setup.sh from Doppler (${DOPPLER_PROJECT}/${DOPPLER_CONFIG})"
    echo "# DO NOT EDIT — re-run ./scripts/codex-setup.sh to refresh"
    echo ""
    doppler secrets download --no-file --format env-no-quotes
  } > "$env_file"

  local secret_count
  secret_count=$(grep -c '=' "$env_file" || echo 0)
  log_success "Generated ${env_file} (${secret_count} variables)"
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
    if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
      echo -e "  Doppler:     ${GREEN}✓${NC} ${DOPPLER_VER} (service token)"
    elif doppler configure get token --plain &>/dev/null; then
      echo -e "  Doppler:     ${GREEN}✓${NC} ${DOPPLER_VER} (CLI login)"
    else
      echo -e "  Doppler:     ${YELLOW}⚠${NC} ${DOPPLER_VER} (not authenticated)"
    fi
  else
    echo -e "  Doppler:     ${RED}✗${NC} not installed"
  fi

  # .env.local
  local env_file="${REPO_ROOT}/apps/web/.env.local"
  if [[ -f "$env_file" ]]; then
    local var_count
    var_count=$(grep -c '=' "$env_file" 2>/dev/null || echo 0)
    echo -e "  .env.local:  ${GREEN}✓${NC} ${var_count} variables"
  else
    echo -e "  .env.local:  ${YELLOW}⚠${NC} not generated (Doppler auth required)"
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
  generate_env_local
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
