#!/usr/bin/env bash
# Purge .claude/settings.local.json* from entire git history.
#
# JOV-2940 remediation — run ONLY after:
#   1. Neon + Clerk credentials are rotated
#   2. Team is notified (all open PRs will need rebase onto new main SHAs)
#   3. You have a backup: git clone --mirror <repo> jovie-backup.git
#
# Requires: pip install git-filter-repo  OR  brew install git-filter-repo
#
# Usage:
#   ./scripts/security/purge-settings-local-history.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "ERROR: git-filter-repo not found. Install: brew install git-filter-repo" >&2
  exit 1
fi

PATHS=(
  .claude/settings.local.json
  .claude/settings.local.json.backup
)

echo "Paths to purge from all history:"
printf '  - %s\n' "${PATHS[@]}"

if $DRY_RUN; then
  echo ""
  echo "DRY RUN — would execute:"
  echo "  git filter-repo --path .claude/settings.local.json --path .claude/settings.local.json.backup --invert-paths --force"
  exit 0
fi

read -r -p "Rotate credentials FIRST. Type PURGE to continue: " confirm
if [[ "$confirm" != "PURGE" ]]; then
  echo "Aborted."
  exit 1
fi

git filter-repo \
  --path .claude/settings.local.json \
  --path .claude/settings.local.json.backup \
  --invert-paths \
  --force

echo ""
echo "History rewritten locally. Next steps:"
echo "  1. git push --force-with-lease origin main"
echo "  2. Ask contributors to: git fetch origin && git reset --hard origin/main"
echo "  3. Re-run Security Scanning workflow to confirm gitleaks is clean"