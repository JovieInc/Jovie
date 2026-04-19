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

install_with_brew() {
  if ! command -v brew &>/dev/null; then
    return 1
  fi

  brew install "$@"
}

install_with_apt() {
  if ! command -v apt-get &>/dev/null; then
    return 1
  fi

  if command -v sudo &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y "$1"
  elif [ "${EUID:-$(id -u)}" -eq 0 ]; then
    apt-get update && apt-get install -y "$1"
  else
    return 1
  fi
}

install_ripgrep_standalone() {
  if ! command -v curl &>/dev/null; then
    warn "curl is required for standalone ripgrep install"
    return 1
  fi

  if ! command -v tar &>/dev/null; then
    warn "tar is required for standalone ripgrep install"
    return 1
  fi

  if ! command -v node &>/dev/null; then
    warn "Node.js is required for standalone ripgrep install"
    return 1
  fi

  local os arch asset_suffix api_response asset_urls download_url checksum_url tmp_dir archive_path checksum_path extracted_rg path_already_contains_local_bin
  os="$(uname -s 2>/dev/null || echo unknown)"
  arch="$(uname -m 2>/dev/null || echo unknown)"

  case "${os}/${arch}" in
    Darwin/arm64)
      asset_suffix="aarch64-apple-darwin.tar.gz"
      ;;
    Darwin/x86_64)
      asset_suffix="x86_64-apple-darwin.tar.gz"
      ;;
    Linux/x86_64)
      asset_suffix="x86_64-unknown-linux-musl.tar.gz"
      ;;
    Linux/arm64 | Linux/aarch64)
      asset_suffix="aarch64-unknown-linux-gnu.tar.gz"
      ;;
    *)
      warn "No standalone ripgrep asset configured for ${os}/${arch}"
      return 1
      ;;
  esac

  info "Falling back to standalone ripgrep install..."
  api_response="$(curl -fsSL https://api.github.com/repos/BurntSushi/ripgrep/releases/latest)" || return 1
  asset_urls="$(printf '%s' "$api_response" | node -e '
    const fs = require("fs");
    const suffix = process.argv[1];
    const release = JSON.parse(fs.readFileSync(0, "utf8"));
    const asset = (release.assets || []).find((item) =>
      typeof item.browser_download_url === "string" &&
      item.browser_download_url.endsWith(suffix),
    );
    const checksumAsset = (release.assets || []).find((item) =>
      typeof item.browser_download_url === "string" &&
      item.browser_download_url.endsWith(`${suffix}.sha256`),
    );
    if (!asset || !checksumAsset) {
      process.exit(1);
    }
    process.stdout.write(`${asset.browser_download_url}\t${checksumAsset.browser_download_url}`);
  ' "$asset_suffix")" || return 1
  IFS=$'\t' read -r download_url checksum_url <<< "$asset_urls"
  if [[ -z "$download_url" || -z "$checksum_url" ]]; then
    warn "Could not resolve standalone ripgrep download assets"
    return 1
  fi
  case ":$PATH:" in
    *":$HOME/.local/bin:"*)
      path_already_contains_local_bin=true
      ;;
    *)
      path_already_contains_local_bin=false
      ;;
  esac

  tmp_dir="$(mktemp -d)"
  if ! (
    trap 'rm -rf "$tmp_dir"' EXIT
    archive_path="$tmp_dir/$(basename "$download_url")"
    checksum_path="$tmp_dir/$(basename "$checksum_url")"
    curl -fsSL "$download_url" -o "$archive_path"
    curl -fsSL "$checksum_url" -o "$checksum_path"
    (
      cd "$tmp_dir" || exit 1
      if command -v sha256sum &>/dev/null; then
        sha256sum -c "$(basename "$checksum_path")"
      elif command -v shasum &>/dev/null; then
        shasum -a 256 -c "$(basename "$checksum_path")"
      else
        warn "sha256sum or shasum is required to verify standalone ripgrep downloads"
        exit 1
      fi
    ) >/dev/null || {
      warn "Standalone ripgrep checksum verification failed"
      exit 1
    }
    tar -xzf "$archive_path" -C "$tmp_dir"

    extracted_rg="$(find "$tmp_dir" -type f -path '*/rg' | head -1)"
    if [[ -z "$extracted_rg" ]]; then
      warn "Standalone ripgrep archive did not contain an rg binary"
      exit 1
    fi

    mkdir -p "$HOME/.local/bin"
    install -m 0755 "$extracted_rg" "$HOME/.local/bin/rg"
  ); then
    return 1
  fi

  export PATH="$HOME/.local/bin:$PATH"
  success "ripgrep installed to $HOME/.local/bin/rg"
  if [[ "$path_already_contains_local_bin" != "true" ]]; then
    info 'Add $HOME/.local/bin to your PATH (for example in ~/.zshrc or ~/.bashrc) to keep rg available in future shells'
  fi
}

MISSING=()
IS_WORKTREE=false
DOPPLER_PROJECT="jovie-web"
DOPPLER_CONFIG="dev"
DOPPLER_LOCAL_RUN=(doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --)

if git rev-parse --is-inside-work-tree &>/dev/null && [ -f ".git" ]; then
  IS_WORKTREE=true
fi

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

# ─── 3. ripgrep ─────────────────────────────────────────────────────────────
echo ""
echo "── ripgrep ──────────────────────────────────────────────────────────────"
if command -v rg &>/dev/null; then
  success "$(rg --version 2>/dev/null | head -1)"
else
  warn "ripgrep (rg) not found — installing if supported..."
  OS="$(uname -s 2>/dev/null || echo Windows)"
  case "$OS" in
    Darwin)
      if command -v brew &>/dev/null; then
        info "Installing via Homebrew..."
        if ! install_with_brew ripgrep; then
          warn "Homebrew install failed for ripgrep"
          if ! install_ripgrep_standalone; then
            warn "Standalone install failed — install ripgrep manually: brew install ripgrep"
            MISSING+=("ripgrep (rg)")
          fi
        fi
      elif ! install_ripgrep_standalone; then
        warn "Homebrew not found and standalone install failed — install ripgrep manually: brew install ripgrep"
        MISSING+=("ripgrep (rg)")
      fi
      ;;
    Linux)
      if ! install_with_apt ripgrep && ! install_ripgrep_standalone; then
        warn "Auto-install failed — install ripgrep manually with your package manager"
        info "Debian/Ubuntu: sudo apt-get install -y ripgrep"
        MISSING+=("ripgrep (rg)")
      fi
      ;;
    Windows* | MINGW* | MSYS* | CYGWIN*)
      warn "Windows detected — install ripgrep manually"
      info "  winget install BurntSushi.ripgrep"
      MISSING+=("ripgrep (rg)")
      ;;
    *)
      warn "Unknown OS ($OS) — install ripgrep manually"
      MISSING+=("ripgrep (rg)")
      ;;
  esac

  if command -v rg &>/dev/null; then
    success "$(rg --version 2>/dev/null | head -1)"
  fi
fi

# ─── 4. Doppler CLI ─────────────────────────────────────────────────────────
echo ""
echo "── Doppler CLI ─────────────────────────────────────────────────────────"
if command -v doppler &>/dev/null; then
  success "Doppler CLI $(doppler --version 2>/dev/null | head -1)"
else
  warn "Doppler CLI not found"
  OS="$(uname -s 2>/dev/null || echo Windows)"
  case "$OS" in
    Darwin)
      if command -v brew &>/dev/null; then
        info "Installing via Homebrew..."
        if ! install_with_brew dopplerhq/cli/doppler; then
          warn "Homebrew install failed for Doppler CLI"
          MISSING+=("Doppler CLI")
        fi
      else
        warn "Homebrew not found. Install Doppler CLI manually:"
        info "  brew install dopplerhq/cli/doppler"
        info "  or install Homebrew first: https://brew.sh"
        MISSING+=("Doppler CLI")
      fi
      ;;
    Linux)
      warn "Linux detected. Install Doppler CLI manually before continuing:"
      info "  apt: sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg"
      info "  docs: https://docs.doppler.com/docs/install-cli"
      MISSING+=("Doppler CLI")
      ;;
    Windows* | MINGW* | MSYS* | CYGWIN*)
      warn "Windows detected — install Doppler manually:"
      info "  PowerShell: (Invoke-WebRequest -Uri 'https://cli.doppler.com/install.ps1' -UseBasicParsing).Content | powershell"
      MISSING+=("Doppler CLI")
      ;;
    *)
      warn "Unknown OS ($OS). Install Doppler CLI manually:"
      info "  https://docs.doppler.com/docs/install-cli"
      MISSING+=("Doppler CLI")
      ;;
  esac
  if command -v doppler &>/dev/null; then
    success "Doppler CLI installed"
  fi
fi

# ─── 5. pnpm install ────────────────────────────────────────────────────────
echo ""
echo "── Dependencies ────────────────────────────────────────────────────────"
if command -v pnpm &>/dev/null; then
  if [[ "$IS_WORKTREE" == "true" ]]; then
    info "Fresh worktree detected (.git is a file) — installing dependencies for this worktree."
  fi
  info "Running pnpm install..."
  pnpm install
  success "Dependencies installed"
else
  warn "Skipping pnpm install — pnpm not available"
  MISSING+=("pnpm install")
fi

# ─── 5.5. Clear stale Turbopack cache ──────────────────────────────────────
echo ""
echo "── Turbopack cache ─────────────────────────────────────────────────"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEXT_CACHE="$REPO_ROOT/apps/web/.next/cache"
if [ -d "$NEXT_CACHE" ]; then
  rm -rf "$NEXT_CACHE/pack" "$NEXT_CACHE/turbopack"
  success "Cleared stale Turbopack cache"
else
  info "No Turbopack cache to clear"
fi

# ─── 6. Doppler auth / config check ─────────────────────────────────────────
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
    if "${DOPPLER_LOCAL_RUN[@]}" echo "doppler-ok" &>/dev/null 2>&1; then
      success "Doppler is authenticated for ${DOPPLER_PROJECT} / ${DOPPLER_CONFIG}"
    else
      # Try to auto-configure the project/config scope
      info "Configuring Doppler project (${DOPPLER_PROJECT} / ${DOPPLER_CONFIG})..."
      if doppler setup --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --no-interactive 2>/dev/null; then
        success "Doppler configured (${DOPPLER_PROJECT} / ${DOPPLER_CONFIG})"
      else
        # Auto-setup failed — likely not authenticated
        if ! doppler configure get token &>/dev/null 2>&1; then
          warn "Doppler is not authenticated"
          echo ""
          echo "  To authenticate:"
          echo "    doppler login"
          echo ""
          echo "  Then re-run: ./scripts/setup.sh"
          MISSING+=("Doppler auth (run: doppler login)")
        else
          warn "Could not auto-configure Doppler project. Run manually:"
          info "doppler setup --project ${DOPPLER_PROJECT} --config ${DOPPLER_CONFIG}"
        fi
      fi
    fi
  fi
fi

# ─── 7. Sync dev Clerk IDs ────────────────────────────────────────────────────
# The dev Clerk instance assigns different user IDs than production.
# If the shared DB has production Clerk IDs, local auth will fail with
# USER_CREATION_FAILED. This step syncs them automatically.
echo ""
echo "── Dev Clerk ID sync ─────────────────────────────────────────────────"
if command -v doppler &>/dev/null && "${DOPPLER_LOCAL_RUN[@]}" echo "ok" &>/dev/null 2>&1; then
  SYNC_SCRIPT="$REPO_ROOT/scripts/sync-dev-clerk-ids.ts"
  if [[ -f "$SYNC_SCRIPT" ]]; then
    if "${DOPPLER_LOCAL_RUN[@]}" pnpm tsx "$SYNC_SCRIPT" 2>/dev/null; then
      success "Dev Clerk IDs synced"
    else
      warn "Clerk ID sync failed (non-blocking — app may prompt user creation)"
    fi
  else
    info "No sync script found — skipping"
  fi
else
  info "Skipping Clerk ID sync (Doppler not configured)"
fi

# ─── Final status ────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────────────────"
if [[ ${#MISSING[@]} -eq 0 ]]; then
  success "Ready to develop"
  echo ""
  echo "  Start the dev server:"
  echo "    pnpm run dev:web:local"
  echo ""
  echo "  Run tests:"
  echo "    pnpm run test:web"
  echo ""
  echo "  Start browse-compatible local auth flow:"
  echo "    pnpm run dev:web:browse"
else
  warn "Missing: $(IFS=', '; echo "${MISSING[*]}")"
  echo "  See instructions above to resolve each item, then re-run: ./scripts/setup.sh"
  exit 1
fi
echo ""
