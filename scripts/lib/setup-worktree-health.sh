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
#   2. Node pin is 22.23.1+
#   3. pnpm pin is exactly 9.15.4
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
  local version
  version="$(node --version 2>/dev/null || true)"
  [[ "$version" =~ ^v22\.([0-9]+)\.([0-9]+) ]] || return 1
  ((10#${BASH_REMATCH[1]} > 23 || (10#${BASH_REMATCH[1]} == 23 && 10#${BASH_REMATCH[2]} >= 1)))
}

jovie_setup_pnpm_pin_ok() {
  command -v pnpm &>/dev/null || return 1
  [[ "$(pnpm --version 2>/dev/null || true)" == "9.15.4" ]]
}

jovie_setup_worktree_healthy() {
  local repo_root="${1:-${REPO_ROOT:?REPO_ROOT is required}}"
  local fingerprint previous fingerprint_file

  [[ "${JOVIE_SETUP_FORCE:-0}" != "1" ]] || return 1
  jovie_setup_node_pin_ok || return 1
  jovie_setup_pnpm_pin_ok || return 1
  [[ -f "$repo_root/node_modules/.modules.yaml" ]] || return 1

  fingerprint="$(jovie_setup_hash_dependency_inputs "$repo_root" || true)"
  [[ -n "$fingerprint" ]] || return 1

  fingerprint_file="$repo_root/node_modules/.cache/jovie-setup/deps.sha256"
  [[ -f "$fingerprint_file" ]] || return 1
  previous="$(tr -d '[:space:]' <"$fingerprint_file" || true)"
  [[ -n "$previous" && "$fingerprint" == "$previous" ]]
}
