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
SETUP_START_SECONDS=$(date +%s)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DOPPLER_PROJECT="jovie-web"
DOPPLER_CONFIG="dev"
DOPPLER_LOCAL_RUN=(doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --)

is_safe_cache_directory() {
  local boundary="$1"
  local candidate="$2"
  local relative current part candidate_real
  local -a parts
  [[ -d "$boundary" && ! -L "$boundary" ]] || return 1
  case "$candidate" in
    "$boundary"/*) ;;
    *) return 1 ;;
  esac
  relative="${candidate#"$boundary"/}"
  current="$boundary"
  IFS='/' read -r -a parts <<< "$relative"
  for part in "${parts[@]}"; do
    [[ -n "$part" && "$part" != "." && "$part" != ".." ]] || return 1
    current="$current/$part"
    [[ ! -L "$current" ]] || return 1
    [[ -d "$current" ]] || return 1
  done
  candidate_real="$(cd "$candidate" && pwd -P)" || return 1
  [[ "$candidate_real" == "$candidate" ]]
}

cleanup_next_cache() {
  local root="$1"
  local max_kib="${JOVIE_NEXT_CACHE_MAX_KIB:-8388608}"
  local force_reset="${JOVIE_DEV_RESET_NEXT_CACHE:-0}"
  local total_kib=0 path size_kib
  local cache_paths=(
    "$root/apps/web/.next/dev/cache/turbopack"
    "$root/apps/web/.next/cache/turbopack"
    "$root/apps/web/.next/cache/pack"
  )

  for path in "${cache_paths[@]}"; do
    [[ -d "$path" ]] || continue
    if ! is_safe_cache_directory "$root" "$path"; then
      warn "Preserved unsafe or symlinked Next cache path: $path"
      return 0
    fi
    size_kib="$(du -sk "$path" 2>/dev/null | awk '{print $1}')"
    total_kib=$((total_kib + ${size_kib:-0}))
  done

  if [[ "$force_reset" != "1" ]] && (( total_kib <= max_kib )); then
    info "Preserved Next cache (${total_kib} KiB <= ${max_kib} KiB limit; set JOVIE_DEV_RESET_NEXT_CACHE=1 to force reset)"
    return 0
  fi

  if [[ "$force_reset" != "1" && "${JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK:-0}" != "1" ]]; then
    local writers=""
    if [[ "${JOVIE_SETUP_CACHE_TEST_NO_LSOF:-0}" == "1" ]] || ! command -v lsof >/dev/null 2>&1; then
      warn "Next cache exceeds ${max_kib} KiB but lsof is unavailable; preserving it because active ownership cannot be proven"
      return 0
    fi
    for path in "${cache_paths[@]}"; do
      [[ -d "$path" ]] || continue
      writers+="$(lsof +D "$path" 2>/dev/null | awk 'NR > 1 && $1 ~ /^(node|next|pnpm|turbo|bun|npm|yarn|tsc)/ { print $1 " pid=" $2 }' | sort -u || true)"
    done
    if [[ -n "$writers" ]]; then
      warn "Next cache exceeds ${max_kib} KiB but is owned by an active process; skipping reset"
      return 0
    fi
    if ps -axo command= 2>/dev/null | grep -F "$root" | grep -E 'next dev|next-server|turbo dev|pnpm( run)? dev:web' >/dev/null 2>&1; then
      warn "Next cache exceeds ${max_kib} KiB but a repo dev process is active; skipping reset"
      return 0
    fi
  fi

  for path in "${cache_paths[@]}"; do
    [[ -d "$path" ]] || continue
    is_safe_cache_directory "$root" "$path" || {
      warn "Preserved Next caches because a path became unsafe: $path"
      return 0
    }
    rm -rf -- "$path"
  done
  if [[ "$force_reset" == "1" ]]; then
    success "Cleared current and legacy Next caches (forced reset)"
  else
    success "Cleared current and legacy Next caches (${total_kib} KiB exceeded ${max_kib} KiB limit)"
  fi
}

if [[ "${JOVIE_SETUP_CACHE_ONLY:-0}" == "1" ]]; then
  if [[
    "${JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK:-0}" == "1" &&
    "${JOVIE_SETUP_CACHE_TEST_MODE:-0}" != "1"
  ]]; then
    echo "JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK is restricted to cache test mode" >&2
    exit 2
  fi
  if [[
    "${JOVIE_SETUP_CACHE_TEST_NO_LSOF:-0}" == "1" &&
    "${JOVIE_SETUP_CACHE_TEST_MODE:-0}" != "1"
  ]]; then
    echo "JOVIE_SETUP_CACHE_TEST_NO_LSOF is restricted to cache test mode" >&2
    exit 2
  fi
  setup_cache_root="$REPO_ROOT"
  if [[ -n "${JOVIE_SETUP_CACHE_ROOT:-}" ]]; then
    if [[ "${JOVIE_SETUP_CACHE_TEST_MODE:-0}" != "1" ]]; then
      echo "JOVIE_SETUP_CACHE_ROOT is restricted to explicit test mode" >&2
      exit 2
    fi
    if [[ ! -d "$JOVIE_SETUP_CACHE_ROOT" || -L "$JOVIE_SETUP_CACHE_ROOT" ]]; then
      echo "Setup cache test root must be a real directory" >&2
      exit 2
    fi
    setup_cache_root="$(cd "$JOVIE_SETUP_CACHE_ROOT" && pwd -P)"
    if [[ "$(basename "$setup_cache_root")" != jovie-setup-cache-* ]]; then
      echo "Setup cache test root must be a jovie-setup-cache-* fixture" >&2
      exit 2
    fi
  fi
  node "$REPO_ROOT/scripts/local-runtime-retention.mjs" --apply \
    --repo-root "$setup_cache_root"
  cleanup_next_cache "$setup_cache_root"
  exit 0
fi

if [[ -n "${JOVIE_SETUP_CACHE_ROOT:-}" ]]; then
  echo "JOVIE_SETUP_CACHE_ROOT is only valid with JOVIE_SETUP_CACHE_ONLY=1" >&2
  exit 2
fi
if [[ "${JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK:-0}" == "1" ]]; then
  echo "JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK is restricted to cache test mode" >&2
  exit 2
fi

if git rev-parse --is-inside-work-tree &>/dev/null && [ -f ".git" ]; then
  IS_WORKTREE=true
fi

hash_dependency_inputs() {
  local hash_cmd
  if command -v shasum &>/dev/null; then
    hash_cmd=(shasum -a 256)
  elif command -v sha256sum &>/dev/null; then
    hash_cmd=(sha256sum)
  else
    return 1
  fi

  git ls-files \
    'package.json' \
    '**/package.json' \
    'pnpm-lock.yaml' \
    'pnpm-workspace.yaml' \
    '.npmrc' 2>/dev/null |
    sort |
    xargs "${hash_cmd[@]}" |
    "${hash_cmd[@]}" |
    awk '{print $1}'
}

# ─── 1. Node.js version check ───────────────────────────────────────────────
echo ""
echo "── Node.js ─────────────────────────────────────────────────────────────"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  if [[ "$NODE_VERSION" =~ ^v22\.([0-9]+)\.([0-9]+) ]] &&
    ((10#${BASH_REMATCH[1]} > 23 || (10#${BASH_REMATCH[1]} == 23 && 10#${BASH_REMATCH[2]} >= 1))); then
    success "Node.js $NODE_VERSION (22.23.1+ ✓)"
  else
    warn "Node.js $NODE_VERSION detected — MUST be 22.x (22.23.1+)"
    info "Fix: nvm use 22  (or: nvm install 22)"
    MISSING+=("Node.js 22.23.1+")
  fi
else
  warn "Node.js not found"
  info "Install via nvm: https://github.com/nvm-sh/nvm"
  MISSING+=("Node.js 22.23.1+")
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
    info "Git worktree detected (.git is a file). Dependencies are still per-worktree."
  fi

  SETUP_CACHE_DIR="$REPO_ROOT/node_modules/.cache/jovie-setup"
  DEP_FINGERPRINT_FILE="$SETUP_CACHE_DIR/deps.sha256"
  DEP_FINGERPRINT="$(hash_dependency_inputs || true)"
  PREVIOUS_DEP_FINGERPRINT=""
  if [[ -f "$DEP_FINGERPRINT_FILE" ]]; then
    PREVIOUS_DEP_FINGERPRINT="$(cat "$DEP_FINGERPRINT_FILE" 2>/dev/null || true)"
  fi

  if [[ -n "$DEP_FINGERPRINT" && -f "$REPO_ROOT/node_modules/.modules.yaml" && "$DEP_FINGERPRINT" == "$PREVIOUS_DEP_FINGERPRINT" ]]; then
    success "Dependencies unchanged — skipped pnpm install"
  else
    info "Running pnpm install..."
    pnpm install
    mkdir -p "$SETUP_CACHE_DIR"
    if [[ -n "$DEP_FINGERPRINT" ]]; then
      printf '%s\n' "$DEP_FINGERPRINT" >"$DEP_FINGERPRINT_FILE"
    fi
    success "Dependencies installed"
  fi
else
  warn "Skipping pnpm install — pnpm not available"
  MISSING+=("pnpm install")
fi

# ─── 5.5. Turbopack cache ──────────────────────────────────────────────────
echo ""
echo "── Turbopack cache ─────────────────────────────────────────────────"
node "$REPO_ROOT/scripts/local-runtime-retention.mjs" --apply --repo-root "$REPO_ROOT"
cleanup_next_cache "$REPO_ROOT"

echo ""
echo "── Generated artifact retention ───────────────────────────────────────"
node "$REPO_ROOT/scripts/generated-artifact-retention.mjs" --apply --repo-root "$REPO_ROOT"
success "Applied bounded generated-artifact retention"

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

# ─── 7. GitHub CLI auth ──────────────────────────────────────────────────────
echo ""
echo "── GitHub CLI auth ───────────────────────────────────────────────────"
if ! command -v gh &>/dev/null; then
  warn "GitHub CLI (gh) not found"
  info "Install: winget install GitHub.cli  (Windows) or brew install gh (macOS)"
  info "Some automation workflows, including PR train runs, require gh auth."
else
  if gh auth status -h github.com &>/dev/null 2>&1; then
    success "GitHub CLI is authenticated for github.com"
  else
    GH_AUTH_OK=false
    if [[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]]; then
      if GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}" gh auth status -h github.com &>/dev/null 2>&1; then
        GH_AUTH_OK=true
      fi
    fi

    if [[ "$GH_AUTH_OK" != "true" ]] && command -v doppler &>/dev/null && "${DOPPLER_LOCAL_RUN[@]}" sh -c 'test -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}"' &>/dev/null 2>&1; then
      if "${DOPPLER_LOCAL_RUN[@]}" gh auth status -h github.com &>/dev/null 2>&1; then
        GH_AUTH_OK=true
      fi
    fi

    if [[ "$GH_AUTH_OK" == "true" ]]; then
      success "GitHub CLI can authenticate with GH_TOKEN/GITHUB_TOKEN"
    else
      warn "GitHub CLI is installed but not authenticated"
      echo ""
      echo "  To authenticate interactively:"
      echo "    gh auth login"
      echo ""
      echo "  For automation, provide GH_TOKEN or GITHUB_TOKEN via the environment or Doppler."
      info "PR train runs cannot update branches, promote drafts, or enable auto-merge without GitHub auth."
    fi
  fi
fi

# ─── 8. Sync dev Clerk IDs ───────────────────────────────────────────────────
# The dev Clerk instance assigns different user IDs than production.
# If the shared DB has production Clerk IDs, local auth will fail with
# USER_CREATION_FAILED. This step syncs them automatically.
echo ""
echo "── Dev Clerk ID sync ─────────────────────────────────────────────────"
CLERK_SYNC_STAMP="$REPO_ROOT/node_modules/.cache/jovie-setup/dev-clerk-sync.stamp"
SHOULD_SYNC_CLERK=false
if [[ "${JOVIE_DEV_SYNC_CLERK_IDS:-0}" == "1" ]]; then
  SHOULD_SYNC_CLERK=true
elif [[ ! -f "$CLERK_SYNC_STAMP" ]]; then
  SHOULD_SYNC_CLERK=true
elif find "$CLERK_SYNC_STAMP" -mtime +7 -print -quit 2>/dev/null | grep -q .; then
  SHOULD_SYNC_CLERK=true
fi

if [[ "$SHOULD_SYNC_CLERK" != "true" ]]; then
  success "Dev Clerk IDs recently synced — skipped"
elif command -v doppler &>/dev/null && "${DOPPLER_LOCAL_RUN[@]}" echo "ok" &>/dev/null 2>&1; then
  SYNC_SCRIPT="$REPO_ROOT/scripts/sync-dev-clerk-ids.ts"
  if [[ -f "$SYNC_SCRIPT" ]]; then
    if "${DOPPLER_LOCAL_RUN[@]}" pnpm tsx "$SYNC_SCRIPT" 2>/dev/null; then
      mkdir -p "$(dirname "$CLERK_SYNC_STAMP")"
      touch "$CLERK_SYNC_STAMP"
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
  SETUP_DURATION_SECONDS=$(( $(date +%s) - SETUP_START_SECONDS ))
  success "Ready to develop"
  info "Setup completed in ${SETUP_DURATION_SECONDS}s"
  echo ""
  echo "  Start the fast local dev server:"
  echo "    pnpm run dev:web:fast"
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
