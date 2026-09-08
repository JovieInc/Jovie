#!/usr/bin/env bash
#
# Codex lifecycle cleanup for Jovie.
#
# Stop is a turn boundary, not task completion. Default and hook invocations
# report candidates only; runtime allocations require a future release contract.
set -euo pipefail

CODEX_HOOK=0
if [[ "${1:-}" == "--codex-hook" ]]; then
  CODEX_HOOK=1
  shift
  exec 3>&1
  exec 1>&2
fi

MODE="dry-run"
if [[ "${1:-}" == "--dry-run" ]]; then
  MODE="dry-run"
  shift
elif [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
  shift
fi

if [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--codex-hook] [--dry-run|--apply]" >&2
  exit 2
fi

if [[ "$CODEX_HOOK" == "1" ]]; then
  MODE="dry-run"
  echo "Stop hook is not task completion; reporting candidates only" >&2
fi

if [[ "${JOVIE_SETUP_CACHE_SKIP_OWNER_CHECK:-0}" == "1" ]]; then
  echo "Owner-check bypass is not supported by cleanup" >&2
  exit 2
fi

if [[ ! -t 0 ]]; then
  cat >/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
if [[ -n "${JOVIE_CLEANUP_REPO_ROOT:-}" ]]; then
  if [[ "${JOVIE_CLEANUP_TEST_MODE:-0}" != "1" ]]; then
    echo "JOVIE_CLEANUP_REPO_ROOT is restricted to explicit test mode" >&2
    exit 2
  fi
  if [[ ! -d "$JOVIE_CLEANUP_REPO_ROOT" || -L "$JOVIE_CLEANUP_REPO_ROOT" ]]; then
    echo "Cleanup test root must be a real directory" >&2
    exit 2
  fi
  REPO_ROOT="$(cd "$JOVIE_CLEANUP_REPO_ROOT" && pwd -P)"
  if [[ "$(basename "$REPO_ROOT")" != jovie-cleanup-* ]]; then
    echo "Cleanup test root must be a jovie-cleanup-* fixture" >&2
    exit 2
  fi
else
  if [[ "${JOVIE_CLEANUP_TEST_MODE:-0}" == "1" ]]; then
    echo "JOVIE_CLEANUP_TEST_MODE requires a cleanup fixture override" >&2
    exit 2
  fi
  REPO_ROOT="$SCRIPT_REPO_ROOT"
fi

cd "$REPO_ROOT"

echo "Running Codex cleanup (${MODE})..."

is_safe_owned_directory() {
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

report_cache_dir() {
  local path="$1"
  local max_kib="$2"
  [[ -d "$path" ]] || return 0
  if ! is_safe_owned_directory "$REPO_ROOT" "$path"; then
    echo "  Skipped ${path#$REPO_ROOT/}: unsafe or symlinked cache path" >&2
    return 0
  fi

  local size_kib
  size_kib="$(du -sk "$path" 2>/dev/null | awk '{print $1}')"
  size_kib="${size_kib:-0}"
  if (( size_kib <= max_kib )); then
    echo "  Preserved cache ${path#$REPO_ROOT/} (${size_kib} KiB <= ${max_kib} KiB limit)"
    return 0
  fi

  echo "  Cleanup debt ${path#$REPO_ROOT/}: ${size_kib} KiB; no verified allocation release, preserved"
}

# Git common directories and worktree metadata are shared across tasks. Neither
# process absence nor age grants this task authority to delete or prune them.
echo "  Preserved Git temp packs and worktree metadata: no verified allocation release"

NEXT_CACHE_MAX_KIB="${JOVIE_NEXT_CACHE_MAX_KIB:-8388608}"
TURBO_CACHE_MAX_KIB="${JOVIE_TURBO_CACHE_MAX_KIB:-4194304}"
node "$SCRIPT_DIR/local-runtime-retention.mjs" "--$MODE" --repo-root "$REPO_ROOT"
report_cache_dir "$REPO_ROOT/apps/web/.next/dev/cache/turbopack" "$NEXT_CACHE_MAX_KIB"
report_cache_dir "$REPO_ROOT/apps/web/.next/cache/turbopack" "$NEXT_CACHE_MAX_KIB"
report_cache_dir "$REPO_ROOT/apps/web/.next/cache/pack" "$NEXT_CACHE_MAX_KIB"
report_cache_dir "$REPO_ROOT/.turbo/cache" "$TURBO_CACHE_MAX_KIB"
node "$SCRIPT_DIR/generated-artifact-retention.mjs" "--$MODE" --repo-root "$REPO_ROOT"

if [[ "$MODE" == "dry-run" ]]; then
  echo "  Skipped optional external cleanup in dry-run mode"
elif [[ "${CODEX_CLEANUP_E2E_USERS:-0}" == "1" ]]; then
  if command -v doppler >/dev/null 2>&1; then
    doppler run --project jovie-web --config dev -- \
      pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force || {
        echo "  E2E user cleanup failed; continuing Codex cleanup" >&2
      }
  else
    echo "  Doppler CLI not available; skipped E2E user cleanup" >&2
  fi
else
  echo "  Skipped E2E user cleanup (set CODEX_CLEANUP_E2E_USERS=1 to enable)"
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "  Skipped archive cleanup in dry-run mode"
elif [[ "${CODEX_ARCHIVE_ON_STOP:-0}" == "1" ]]; then
  bash "$REPO_ROOT/scripts/archive.sh"
else
  echo "  Skipped archive cleanup (set CODEX_ARCHIVE_ON_STOP=1 to enable)"
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "  Skipped GBrain sync in dry-run mode"
elif [[ "${CODEX_CLEANUP_SKIP_GBRAIN:-0}" == "1" ]]; then
  echo "  Skipped GBrain sync (CODEX_CLEANUP_SKIP_GBRAIN=1)"
elif [[ -f "$REPO_ROOT/scripts/codex-gbrain-sync.sh" ]]; then
  bash "$REPO_ROOT/scripts/codex-gbrain-sync.sh" stop || {
    echo "  GBrain auto-sync failed; continuing Codex cleanup" >&2
  }
else
  echo "  GBrain auto-sync script missing; skipped"
fi

echo "Codex cleanup ${MODE} complete."

if [[ "$CODEX_HOOK" == "1" ]]; then
  printf '%s\n' '{"continue":true}' >&3
  exec 3>&-
fi
