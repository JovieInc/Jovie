#!/usr/bin/env bash
# scripts/archive.sh — Clean up build artifacts and dependencies to free disk space.
# Run when archiving a Conductor workspace.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Archiving Jovie workspace..."

# Remove web app build artifacts
for dir in .next out dist coverage .nyc_output; do
  if [ -d "apps/web/$dir" ]; then
    rm -rf "apps/web/$dir"
    echo "  Removed apps/web/$dir"
  fi
done

# Remove turbo cache
find . -name ".turbo" -type d -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
echo "  Removed .turbo caches"

# Remove node_modules everywhere
find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
echo "  Removed node_modules"

echo "Archive cleanup complete."
