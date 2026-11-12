#!/usr/bin/env bash
# Shared worktree health check for scripts/setup.sh.
#
# Claude SessionStart (.claude/hooks/session-start.sh) and Codex SessionStart
# (scripts/codex-setup.sh) both invoke setup.sh on every session. When this
# returns 0, setup.sh skips the expensive body (Doppler, gh, Clerk tsx,
# migration drift tsx, cache lsof). Codex gbrain sync is independent and
# still runs after setup.sh returns.
#
# Skip (return 0) only when ALL of:
#   1. JOVIE_SETUP_FORCE is not 1
#   2. Node pin is 24.21.0+
#   3. pnpm pin is exactly 9.15.9
#   4. $repo/node_modules/.modules.yaml exists
#   5. deps fingerprint matches node_modules/.cache/jovie-setup/deps.sha256
#
# Fingerprint miss, missing modules, or wrong pins return 1 so full setup runs.
# Source this file; do not execute it.

# A linked worktree inherits core.bare from the primary checkout unless it has
# its own worktree config. If a prior local repair accidentally set the primary
# checkout to bare, normal git commands and hooks fail before setup can install
# dependencies. Pin this linked worktree to non-bare without changing the
# primary checkout or any global Git setting.
jovie_setup_repair_linked_worktree_git_config() {
  local repo_root="${1:-${REPO_ROOT:?REPO_ROOT is required}}"
  local git_file="$repo_root/.git"
  local git_dir_line git_dir common_dir_ref common_dir

  [[ -f "$git_file" && ! -L "$git_file" ]] || return 0
  git_dir_line="$(sed -n '1p' "$git_file" 2>/dev/null || true)"
  [[ "$git_dir_line" == "gitdir: "* ]] || return 1
  git_dir="${git_dir_line#gitdir: }"
  [[ -n "$git_dir" && -d "$git_dir" && -f "$git_dir/commondir" ]] || return 1

  common_dir_ref="$(tr -d '\r\n' <"$git_dir/commondir")"
  [[ -n "$common_dir_ref" ]] || return 1
  if [[ "$common_dir_ref" = /* ]]; then
    common_dir="$common_dir_ref"
  else
    common_dir="$git_dir/$common_dir_ref"
  fi
  common_dir="$(cd "$common_dir" && pwd -P)" || return 1

  # Git rejects per-worktree config until the repository opts into it. This is
  # repository-local metadata; it does not change the user's global Git config.
  git --git-dir="$common_dir" config extensions.worktreeConfig true

  git --git-dir="$git_dir" --work-tree="$repo_root" \
    config --worktree core.bare false
}

jovie_setup_hash_dependency_inputs() {
  local repo_root="${1:-${REPO_ROOT:-.}}"
  local hash_cmd
  if command -v shasum &>/dev/null; then
    hash_cmd=(shasum -a 256)
  elif command -v sha256sum &>/dev/null; then
    hash_cmd=(sha256sum)
  else
    return 1
  fi

  git -C "$repo_root" ls-files \
    'package.json' \
    '**/package.json' \
    'pnpm-lock.yaml' \
    'pnpm-workspace.yaml' \
    '.npmrc' 2>/dev/null |
    sort |
    (cd "$repo_root" && xargs "${hash_cmd[@]}") |
    "${hash_cmd[@]}" |
    awk '{print $1}'
}

jovie_setup_node_pin_ok() {
  command -v node &>/dev/null || return 1
  local repo_root="${1:-${REPO_ROOT:-.}}" version pinned
  version="$(node --version 2>/dev/null || true)"
  pinned="$(tr -d '[:space:]' < "$repo_root/.nvmrc" 2>/dev/null || true)"
  version="${version#v}"
  pinned="${pinned#v}"
  local v_major v_minor v_patch p_major p_minor p_patch
  IFS='.' read -r v_major v_minor v_patch <<<"$version"
  IFS='.' read -r p_major p_minor p_patch <<<"$pinned"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$pinned" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$v_major" == "$p_major" ]] || return 1
  ((10#$v_minor > 10#$p_minor || (10#$v_minor == 10#$p_minor && 10#$v_patch >= 10#$p_patch)))
}

jovie_setup_pnpm_pin_ok() {
  command -v pnpm &>/dev/null || return 1
  [[ "$(pnpm --version 2>/dev/null || true)" == "9.15.9" ]]
}

jovie_setup_worktree_healthy() {
  local repo_root="${1:-${REPO_ROOT:?REPO_ROOT is required}}"
  local fingerprint previous fingerprint_file

  [[ "${JOVIE_SETUP_FORCE:-0}" != "1" ]] || return 1
  jovie_setup_node_pin_ok "$repo_root" || return 1
  jovie_setup_pnpm_pin_ok || return 1
  [[ -f "$repo_root/node_modules/.modules.yaml" ]] || return 1

  fingerprint="$(jovie_setup_hash_dependency_inputs "$repo_root" || true)"
  [[ -n "$fingerprint" ]] || return 1

  fingerprint_file="$repo_root/node_modules/.cache/jovie-setup/deps.sha256"
  [[ -f "$fingerprint_file" ]] || return 1
  previous="$(tr -d '[:space:]' <"$fingerprint_file" || true)"
  [[ -n "$previous" && "$fingerprint" == "$previous" ]]
}

# Cloud sessions can start on an older Node with no nvm, and every check then
# runs on the wrong Node. When the pin isn't met, fetch the .nvmrc version from
# nodejs.org (checked against its SHASUMS256.txt) into a user cache, put it
# first on PATH, and write it to CLAUDE_ENV_FILE so later shells keep it.
jovie_setup_ensure_pinned_node() {
  local repo_root="${1:-${REPO_ROOT:-.}}" pinned os arch cache dir name tmp dist sum
  jovie_setup_node_pin_ok "$repo_root" && return 0
  pinned="$(tr -d '[:space:]' < "$repo_root/.nvmrc" 2>/dev/null || true)"
  pinned="${pinned#v}"
  [[ "$pinned" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) return 1 ;; esac
  case "$(uname -m)" in x86_64 | amd64) arch=x64 ;; arm64 | aarch64) arch=arm64 ;; *) return 1 ;; esac
  name="node-v$pinned-$os-$arch"
  cache="${JOVIE_NODE_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/jovie-node}"
  dir="$cache/$name"
  if [[ ! -x "$dir/bin/node" ]]; then
    dist="${JOVIE_NODE_DIST_URL:-https://nodejs.org/dist}/v$pinned"
    mkdir -p "$cache" && tmp="$(mktemp -d "$cache/.fetch.XXXXXX")" || return 1
    if curl -fsSL -o "$tmp/$name.tar.gz" "$dist/$name.tar.gz" &&
      curl -fsSL -o "$tmp/SHASUMS256.txt" "$dist/SHASUMS256.txt"; then
      sum="$( (sha256sum "$tmp/$name.tar.gz" 2>/dev/null || shasum -a 256 "$tmp/$name.tar.gz") | cut -d' ' -f1)"
      if grep -qx "$sum  $name.tar.gz" "$tmp/SHASUMS256.txt" && tar -xzf "$tmp/$name.tar.gz" -C "$tmp"; then
        rm -rf "$dir" && mv "$tmp/$name" "$dir"
      fi
    fi
    rm -rf "$tmp"
    [[ -x "$dir/bin/node" ]] || return 1
  fi
  export PATH="$dir/bin:$PATH"
  [[ -z "${CLAUDE_ENV_FILE:-}" ]] || printf 'export PATH=%q:"$PATH"\n' "$dir/bin" >>"$CLAUDE_ENV_FILE"
  jovie_setup_node_pin_ok "$repo_root"
}

# Make the Chromium build that the repo's pinned Playwright drives ready for
# screenshots and e2e, or say in one line why it cannot be. Never fails the
# caller: a missing browser must not block a session that does not render.
# Cheap when the browser is already there (one node resolve, no download).
jovie_setup_playwright_chromium() {
  local repo_root="${1:-${REPO_ROOT:-.}}" web exe
  web="$repo_root/apps/web"
  exe="$(cd "$web" 2>/dev/null && node -e "process.stdout.write(require('@playwright/test').chromium.executablePath())" 2>/dev/null)" || exe=""
  if [[ -z "$exe" ]]; then
    echo "Playwright Chromium: not checked (@playwright/test does not resolve; install dependencies first)."
    return 0
  fi
  if [[ -x "$exe" ]]; then
    echo "Playwright Chromium: ready ($exe)."
    return 0
  fi
  # The environment says not to fetch browsers (often with a dead
  # PLAYWRIGHT_DOWNLOAD_HOST); respect it rather than reach for another source.
  if [[ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" == 1 ]]; then
    echo "WARNING: Playwright Chromium is missing at $exe and this environment disables browser downloads (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). Screenshots and e2e cannot render here; capture them in CI (pr-visual-review, screenshots workflows)."
    return 0
  fi
  echo "Installing Playwright Chromium for screenshots and e2e..."
  if (cd "$web" && pnpm exec playwright install chromium) && [[ -x "$exe" ]]; then
    echo "Playwright Chromium: ready ($exe)."
  else
    echo "WARNING: Playwright Chromium install failed; screenshots and e2e cannot render in this session."
  fi
  return 0
}
