#!/bin/bash
# Cursor Hook: afterFileEdit
# Runs format + lint --fix (fast, auto-correcting)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔧 Cursor Hook: Running Biome on changed files..."

changed_files_raw="$(git status --porcelain | sed -E 's/^.. //')"

if [ -z "$changed_files_raw" ]; then
  echo "✅ No changed files detected; skipping Biome"
  exit 0
fi

filtered_files=()
while IFS= read -r file; do
  if [ -z "$file" ]; then
    continue
  fi

  # Handle renames in porcelain output: "old -> new"
  if echo "$file" | grep -q " -> "; then
    file="${file##* -> }"
  fi

  case "$file" in
    *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md)
      if [ -f "$file" ]; then
        filtered_files+=("$file")
      fi
      ;;
    *)
      ;;
  esac
done <<< "$changed_files_raw"

if [ "${#filtered_files[@]}" -eq 0 ]; then
  echo "✅ No supported changed files detected; skipping Biome"
  exit 0
fi

pnpm exec biome check --write --no-errors-on-unmatched "${filtered_files[@]}"

echo "✅ Biome check completed"

