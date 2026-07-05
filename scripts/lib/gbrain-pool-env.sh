#!/usr/bin/env bash
#
# Apply conservative gbrain pool-budget env vars before Supabase-backed CLI runs.
# No-op for PGLite engines and when GBRAIN_POOL_BUDGET_DISABLED=1.
#
# Usage (source, do not execute):
#   . "$(dirname "${BASH_SOURCE[0]}")/gbrain-pool-env.sh"
#   apply_gbrain_pool_budget
#
set -u

_gbrain_pool_env_lib_dir() {
  if [[ -n "${BASH_SOURCE[1]:-}" ]]; then
    cd "$(dirname "${BASH_SOURCE[1]}")" && pwd
  else
    cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
  fi
}

apply_gbrain_pool_budget() {
  local lib_dir config_path exports
  lib_dir="$(_gbrain_pool_env_lib_dir)"
  config_path="${GBRAIN_CONFIG_FILE:-${HOME}/.gbrain/config.json}"

  if [[ ! -f "${lib_dir}/gbrain-pool-env.mjs" ]]; then
    return 0
  fi

  exports="$(node "${lib_dir}/gbrain-pool-env.mjs" --shell "$config_path" 2>/dev/null || true)"
  if [[ -n "$exports" ]]; then
    # shellcheck disable=SC1090
    eval "$exports"
  fi
}