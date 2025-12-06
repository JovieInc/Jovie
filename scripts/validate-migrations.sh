#!/usr/bin/env bash
# Migration Validation Script
# Ensures all migration files are properly registered in _journal.json
# This prevents "column does not exist" errors from unregistered migrations

set -euo pipefail

MIGRATIONS_DIR="drizzle/migrations"
JOURNAL_FILE="$MIGRATIONS_DIR/meta/_journal.json"
EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Validating database migrations..."

# Check if journal file exists
if [ ! -f "$JOURNAL_FILE" ]; then
  echo -e "${RED}❌ Journal file not found: $JOURNAL_FILE${NC}"
  exit 1
fi

# Get all .sql migration files (excluding meta directory)
SQL_FILES=()
while IFS= read -r file; do
  SQL_FILES+=("$file")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -type f | sort)

if [ ${#SQL_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ No migration files found${NC}"
  exit 0
fi

# Extract migration tags from journal
JOURNAL_TAGS=()
while IFS= read -r tag; do
  [ -n "$tag" ] && JOURNAL_TAGS+=("$tag")
done < <(jq -r '.entries[].tag' "$JOURNAL_FILE" 2>/dev/null || true)

if [ ${#JOURNAL_TAGS[@]} -eq 0 ]; then
  echo -e "${RED}❌ No entries found in journal file${NC}"
  exit 1
fi

echo "📋 Found ${#SQL_FILES[@]} migration file(s)"
echo "📋 Found ${#JOURNAL_TAGS[@]} journal entry(ies)"

# Check each SQL file has a journal entry
UNREGISTERED_FILES=()
for sql_file in "${SQL_FILES[@]}"; do
  filename=$(basename "$sql_file" .sql)

  # Check if this migration is in the journal
  if ! printf '%s\n' "${JOURNAL_TAGS[@]}" | grep -q "^${filename}$"; then
    UNREGISTERED_FILES+=("$filename")
    EXIT_CODE=1
  fi
done

# Check for orphaned journal entries (entries without SQL files)
ORPHANED_ENTRIES=()
for tag in "${JOURNAL_TAGS[@]}"; do
  sql_file="$MIGRATIONS_DIR/${tag}.sql"
  if [ ! -f "$sql_file" ]; then
    ORPHANED_ENTRIES+=("$tag")
    EXIT_CODE=1
  fi
done

# Report results
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ All migrations are properly registered${NC}"
  exit 0
fi

# Print errors
if [ ${#UNREGISTERED_FILES[@]} -gt 0 ]; then
  echo -e "\n${RED}❌ Migration Validation Failed${NC}"
  echo -e "${RED}Found ${#UNREGISTERED_FILES[@]} unregistered migration file(s):${NC}"
  for file in "${UNREGISTERED_FILES[@]}"; do
    echo -e "  ${RED}- ${file}.sql${NC}"
  done
  echo ""
  echo -e "${YELLOW}⚠️  These migrations will NOT run in CI or production!${NC}"
  echo ""
  echo "To fix:"
  echo "1. Remove the manually created migration file(s)"
  echo "2. Run: pnpm drizzle-kit generate"
  echo "3. Commit the properly generated migration"
  echo ""
  echo "Or if this is intentional (migration consolidation), update _journal.json manually."
fi

if [ ${#ORPHANED_ENTRIES[@]} -gt 0 ]; then
  echo -e "\n${YELLOW}⚠️  Found ${#ORPHANED_ENTRIES[@]} orphaned journal entry(ies):${NC}"
  for entry in "${ORPHANED_ENTRIES[@]}"; do
    echo -e "  ${YELLOW}- ${entry}${NC}"
  done
  echo ""
  echo "These journal entries have no corresponding .sql file."
  echo "This usually happens after deleting/renaming migration files."
fi

exit $EXIT_CODE
