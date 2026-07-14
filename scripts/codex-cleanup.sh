#!/usr/bin/env bash
#
# Codex lifecycle cleanup for Jovie.
#
# This script is safe to run at the end of every Codex task. It does lightweight
# local cleanup by default and delegates heavier cleanup only when explicitly
# requested through environment flags.
set -euo pipefail

CODEX_HOOK=0
if [[ "${1:-}" == "--codex-hook" ]]; then
  CODEX_HOOK=1
  shift
  exec 3>&1
  exec 1>&2
fi

MODE="apply"
if [[ "${1:-}" == "--dry-run" ]]; then
  MODE="dry-run"
  shift
elif [[ "${1:-}" == "--apply" ]]; then
  shift
fi

if [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--codex-hook] [--dry-run|--apply]" >&2
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

remove_cache_dir() {
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

  if [[ "${JOVIE_CLEANUP_TEST_MODE:-0}" != "1" ]]; then
    if ! command -v lsof >/dev/null 2>&1; then
      echo "  Skipped ${path#$REPO_ROOT/}: lsof unavailable; ownership cannot be verified" >&2
      return 0
    fi
    local writers
    writers="$(lsof +D "$path" 2>/dev/null | awk 'NR > 1 && $1 ~ /^(node|next|pnpm|turbo|bun|npm|yarn|tsc)/ { print $1 " pid=" $2 }' | sort -u || true)"
    if [[ -n "$writers" ]]; then
      echo "  Skipped ${path#$REPO_ROOT/}: active cache owner detected (${writers//$'\n'/, })" >&2
      return 0
    fi
    if ps -axo command= | grep -F "$REPO_ROOT" | grep -E 'next dev|next-server|turbo dev|pnpm( run)? dev:web' >/dev/null 2>&1; then
      echo "  Skipped ${path#$REPO_ROOT/}: active repo dev process detected" >&2
      return 0
    fi
  fi

  if [[ "$MODE" == "dry-run" ]]; then
    echo "  Would remove cache ${path#$REPO_ROOT/} (${size_kib} KiB > ${max_kib} KiB limit)"
  else
    if ! is_safe_owned_directory "$REPO_ROOT" "$path"; then
      echo "  Skipped ${path#$REPO_ROOT/}: cache path became unsafe" >&2
      return 0
    fi
    rm -rf -- "$path"
    echo "  Removed cache ${path#$REPO_ROOT/} (${size_kib} KiB > ${max_kib} KiB limit)"
  fi
}

remove_aged_tmp_packs() {
  local common_dir pack_dir now threshold file file_real mtime age ownership_checks_required
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  [[ -n "$common_dir" ]] || return 0
  [[ "$common_dir" = /* ]] || common_dir="$REPO_ROOT/$common_dir"
  if [[ ! -d "$common_dir" || -L "$common_dir" ]]; then
    echo "  Skipped Git temp packs: unsafe Git common directory" >&2
    return 0
  fi
  common_dir="$(cd "$common_dir" && pwd -P)"
  pack_dir="$common_dir/objects/pack"
  [[ -d "$pack_dir" ]] || return 0
  if ! is_safe_owned_directory "$common_dir" "$pack_dir"; then
    echo "  Skipped Git temp packs: unsafe or symlinked pack directory" >&2
    return 0
  fi
  ownership_checks_required=0
  if [[
    "${JOVIE_CLEANUP_TEST_MODE:-0}" != "1" ||
    "${JOVIE_CLEANUP_TEST_REQUIRE_LSOF:-0}" == "1"
  ]]; then
    ownership_checks_required=1
  fi
  if (( ownership_checks_required == 1 )) && {
    [[ "${JOVIE_CLEANUP_TEST_LSOF_UNAVAILABLE:-0}" == "1" ]] ||
      ! command -v lsof >/dev/null 2>&1
  }; then
    echo "  Skipped Git temp packs: lsof unavailable; ownership cannot be verified" >&2
    return 0
  fi
  now="$(date +%s)"
  threshold="${JOVIE_TMP_PACK_MIN_AGE_SECONDS:-86400}"

  while IFS= read -r -d '' file; do
    mtime="$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo "$now")"
    age=$((now - mtime))
    if (( age < threshold )); then
      echo "  Preserved young Git temp pack ${file##*/} (${age}s old)"
      continue
    fi
    if (( ownership_checks_required == 1 )) && lsof "$file" >/dev/null 2>&1; then
      echo "  Preserved owned Git temp pack ${file##*/}" >&2
      continue
    fi
    if [[ "$MODE" == "dry-run" ]]; then
      echo "  Would remove unowned Git temp pack ${file##*/} (${age}s old)"
    else
      if ! is_safe_owned_directory "$common_dir" "$pack_dir"; then
        echo "  Skipped Git temp packs: pack directory became unsafe" >&2
        return 0
      fi
      if [[ ! -f "$file" || -L "$file" ]]; then
        echo "  Preserved changed Git temp pack ${file##*/}" >&2
        continue
      fi
      file_real="$(cd "$(dirname "$file")" && pwd -P)/$(basename "$file")"
      if [[ "$file_real" != "$file" ]]; then
        echo "  Preserved noncanonical Git temp pack ${file##*/}" >&2
        continue
      fi
      rm -f -- "$file"
      echo "  Removed unowned Git temp pack ${file##*/} (${age}s old)"
    fi
  done < <(find "$pack_dir" -maxdepth 1 -type f -name 'tmp_pack_*' -print0)
}

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ "$MODE" == "dry-run" ]]; then
    git worktree prune --dry-run --verbose --expire now || true
    echo "  Would prune stale git worktree metadata"
  else
    git worktree prune --verbose --expire now || true
    echo "  Pruned stale git worktree metadata"
  fi
fi

NEXT_CACHE_MAX_KIB="${JOVIE_NEXT_CACHE_MAX_KIB:-8388608}"
TURBO_CACHE_MAX_KIB="${JOVIE_TURBO_CACHE_MAX_KIB:-4194304}"
node "$SCRIPT_DIR/local-runtime-retention.mjs" "--$MODE" --repo-root "$REPO_ROOT"
remove_cache_dir "$REPO_ROOT/apps/web/.next/dev/cache/turbopack" "$NEXT_CACHE_MAX_KIB"
remove_cache_dir "$REPO_ROOT/apps/web/.next/cache/turbopack" "$NEXT_CACHE_MAX_KIB"
remove_cache_dir "$REPO_ROOT/apps/web/.next/cache/pack" "$NEXT_CACHE_MAX_KIB"
remove_cache_dir "$REPO_ROOT/.turbo/cache" "$TURBO_CACHE_MAX_KIB"
remove_aged_tmp_packs
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
