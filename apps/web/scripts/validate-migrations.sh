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

# Determine which migrations are NEW (added in this branch)
# Only validate idempotency on new migrations - historical ones are grandfathered
BASE_BRANCH="${BASE_BRANCH:-origin/main}"
NEW_MIGRATIONS=()

# Get all .sql migration files (excluding meta directory)
SQL_FILES=()
while IFS= read -r file; do
  SQL_FILES+=("$file")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -type f | sort)

if [ ${#SQL_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ No migration files found${NC}"
  exit 0
fi

# Check if we're in a git repo and can detect new migrations
if git rev-parse --git-dir > /dev/null 2>&1; then
  # Get the git root directory
  GIT_ROOT=$(git rev-parse --show-toplevel)
  # Get the current directory relative to git root
  CURRENT_DIR=$(pwd | sed "s|^$GIT_ROOT/||" | sed "s|^$GIT_ROOT$||")

  # Get migrations that don't exist on the base branch
  for file in "${SQL_FILES[@]}"; do
    filename=$(basename "$file")
    # Construct git-root-relative path
    if [ -n "$CURRENT_DIR" ]; then
      GIT_PATH="$CURRENT_DIR/$MIGRATIONS_DIR/$filename"
    else
      GIT_PATH="$MIGRATIONS_DIR/$filename"
    fi

    # Check if this file exists on the base branch
    if ! git cat-file -e "$BASE_BRANCH:$GIT_PATH" 2>/dev/null; then
      NEW_MIGRATIONS+=("$file")
    fi
  done

  if [ ${#NEW_MIGRATIONS[@]} -gt 0 ]; then
    echo -e "${YELLOW}ℹ️  Found ${#NEW_MIGRATIONS[@]} new migration(s) to validate (not on $BASE_BRANCH):${NC}"
    for migration in "${NEW_MIGRATIONS[@]}"; do
      echo "  - $(basename "$migration")"
    done
    echo ""
  fi
else
  echo -e "${YELLOW}⚠️  Not a git repository - will validate ALL migrations${NC}"
  # Fallback: validate all migrations if not in a git repo
  for file in "${SQL_FILES[@]}"; do
    NEW_MIGRATIONS+=("$file")
  done
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

# Check for CREATE INDEX CONCURRENTLY in migrations (not DROP or comments)
# ONLY check NEW migrations - historical ones are grandfathered
CONCURRENT_FILES=()
for sql_file in "${NEW_MIGRATIONS[@]+"${NEW_MIGRATIONS[@]}"}"; do
  filename=$(basename "$sql_file")
  # Check for CREATE INDEX CONCURRENTLY (case insensitive, ignoring comments and DROP)
  if grep -i "CREATE[[:space:]]\+INDEX[[:space:]]\+CONCURRENTLY" "$sql_file" | grep -v "^[[:space:]]*--" >/dev/null 2>&1; then
    CONCURRENT_FILES+=("$filename")
    EXIT_CODE=1
  fi
done

# Check for non-idempotent CREATE TYPE statements
# ONLY check NEW migrations - historical ones are grandfathered
NON_IDEMPOTENT_TYPE_FILES=()
for sql_file in "${NEW_MIGRATIONS[@]+"${NEW_MIGRATIONS[@]}"}"; do
  filename=$(basename "$sql_file")

  # Look for CREATE TYPE statements (excluding comments)
  if grep -Ev "^[[:space:]]*--" "$sql_file" | grep -i "CREATE[[:space:]]\+TYPE.*AS[[:space:]]\+ENUM" >/dev/null 2>&1; then
    # Extract the section containing CREATE TYPE for analysis
    # Get 10 lines before CREATE TYPE to check for DO block and pg_type
    type_section=$(grep -B 10 -i "CREATE[[:space:]]\+TYPE.*AS[[:space:]]\+ENUM" "$sql_file" | grep -v "^[[:space:]]*--")

    # Check if this CREATE TYPE is in an idempotent DO block
    # Must have: 1) DO $ before CREATE TYPE, 2) pg_type check
    has_do_block=false
    has_pg_type_check=false

    # Use fixed string matching for DO $ to avoid regex escaping issues
    if echo "$type_section" | grep -iF "DO \$" >/dev/null 2>&1; then
      has_do_block=true
    fi

    if echo "$type_section" | grep -i "pg_type" >/dev/null 2>&1; then
      has_pg_type_check=true
    fi

    # Flag as non-idempotent if missing either DO block OR pg_type check
    if [ "$has_do_block" = false ] || [ "$has_pg_type_check" = false ]; then
      NON_IDEMPOTENT_TYPE_FILES+=("$filename")
      EXIT_CODE=1
    fi
  fi
done

# Check for CREATE INDEX without IF NOT EXISTS
# ONLY check NEW migrations - historical ones are grandfathered
NON_IDEMPOTENT_INDEX_FILES=()
for sql_file in "${NEW_MIGRATIONS[@]+"${NEW_MIGRATIONS[@]}"}"; do
  filename=$(basename "$sql_file")
  # Look for CREATE INDEX or CREATE UNIQUE INDEX without IF NOT EXISTS (ignoring comments)
  if grep -Ev "^[[:space:]]*--" "$sql_file" | grep -i "CREATE[[:space:]]\+\(UNIQUE[[:space:]]\+\)\?INDEX" | grep -v -i "IF[[:space:]]\+NOT[[:space:]]\+EXISTS" >/dev/null 2>&1; then
    NON_IDEMPOTENT_INDEX_FILES+=("$filename")
    EXIT_CODE=1
  fi
done

# Check for ALTER TYPE ADD VALUE without IF NOT EXISTS
# ONLY check NEW migrations - historical ones are grandfathered
NON_IDEMPOTENT_ALTER_TYPE_FILES=()
for sql_file in "${NEW_MIGRATIONS[@]+"${NEW_MIGRATIONS[@]}"}"; do
  filename=$(basename "$sql_file")
  # Look for ALTER TYPE ... ADD VALUE without IF NOT EXISTS (ignoring comments)
  if grep -Ev "^[[:space:]]*--" "$sql_file" | grep -i "ALTER[[:space:]]\+TYPE.*ADD[[:space:]]\+VALUE" | grep -v -i "IF[[:space:]]\+NOT[[:space:]]\+EXISTS" >/dev/null 2>&1; then
    NON_IDEMPOTENT_ALTER_TYPE_FILES+=("$filename")
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
  echo -e "${GREEN}✅ All migrations are properly registered and idempotent${NC}"
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

if [ ${#CONCURRENT_FILES[@]} -gt 0 ]; then
  echo -e "\n${RED}❌ CONCURRENTLY Keyword Detected${NC}"
  echo -e "${RED}Found ${#CONCURRENT_FILES[@]} migration file(s) using CREATE INDEX CONCURRENTLY:${NC}"
  for file in "${CONCURRENT_FILES[@]}"; do
    echo -e "  ${RED}- ${file}${NC}"
  done
  echo ""
  echo -e "${YELLOW}⚠️  CREATE INDEX CONCURRENTLY cannot run inside transaction blocks!${NC}"
  echo "Drizzle's migrate() function wraps migrations in transactions, causing failures."
  echo ""
  echo "This will break:"
  echo "  - E2E tests (migration setup fails)"
  echo "  - CI/CD pipeline (deploy blocked)"
  echo "  - Production deployments (migration fails)"
  echo ""
  echo "To fix:"
  echo "  ❌ WRONG: CREATE INDEX CONCURRENTLY idx_name ON table_name (column);"
  echo "  ✅ RIGHT: CREATE INDEX IF NOT EXISTS idx_name ON table_name (column);"
  echo ""
  echo "Why: Drizzle wraps migrations in transactions. PostgreSQL forbids CONCURRENTLY in transactions."
  echo ""
  echo "📖 Read: docs/MIGRATION_CONCURRENTLY_RULE.md for detailed explanation"
  echo "🔗 PostgreSQL docs: https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY"
fi

if [ ${#NON_IDEMPOTENT_TYPE_FILES[@]} -gt 0 ]; then
  echo -e "\n${RED}❌ Non-Idempotent CREATE TYPE Detected${NC}"
  echo -e "${RED}Found ${#NON_IDEMPOTENT_TYPE_FILES[@]} migration file(s) with CREATE TYPE outside DO blocks:${NC}"
  for file in "${NON_IDEMPOTENT_TYPE_FILES[@]}"; do
    echo -e "  ${RED}- ${file}${NC}"
  done
  echo ""
  echo -e "${YELLOW}⚠️  PostgreSQL does NOT support 'CREATE TYPE IF NOT EXISTS'!${NC}"
  echo "CREATE TYPE must be wrapped in a DO block with a pg_type catalog check."
  echo ""
  echo "This will cause:"
  echo "  - Migration failures when re-running against existing databases"
  echo "  - CI test failures (ephemeral database setup)"
  echo "  - Production deployment failures (type already exists)"
  echo ""
  echo "To fix:"
  echo "  ❌ WRONG:"
  echo "    CREATE TYPE user_status AS ENUM ('active', 'pending');"
  echo ""
  echo "  ✅ CORRECT:"
  echo "    DO \$\$"
  echo "    BEGIN"
  echo "      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN"
  echo "        CREATE TYPE user_status AS ENUM ('active', 'pending');"
  echo "      END IF;"
  echo "    END \$\$;"
  echo ""
  echo "Why: Migrations must be idempotent (safe to run multiple times)."
  echo "     PostgreSQL requires explicit existence check via DO blocks for types."
  echo ""
  echo "📌 NOTE: Historical migrations (already on main) are grandfathered - only NEW migrations are validated."
fi

if [ ${#NON_IDEMPOTENT_INDEX_FILES[@]} -gt 0 ]; then
  echo -e "\n${RED}❌ Non-Idempotent CREATE INDEX Detected${NC}"
  echo -e "${RED}Found ${#NON_IDEMPOTENT_INDEX_FILES[@]} migration file(s) with CREATE INDEX missing IF NOT EXISTS:${NC}"
  for file in "${NON_IDEMPOTENT_INDEX_FILES[@]}"; do
    echo -e "  ${RED}- ${file}${NC}"
  done
  echo ""
  echo -e "${YELLOW}⚠️  All CREATE INDEX statements MUST include IF NOT EXISTS!${NC}"
  echo ""
  echo "This will cause:"
  echo "  - Migration failures when re-running against existing databases"
  echo "  - CI test failures (index already exists)"
  echo "  - Production deployment failures"
  echo ""
  echo "To fix:"
  echo "  ❌ WRONG: CREATE INDEX idx_name ON table_name (column);"
  echo "  ✅ RIGHT: CREATE INDEX IF NOT EXISTS idx_name ON table_name (column);"
  echo ""
  echo "Why: Migrations must be idempotent (safe to run multiple times)."
  echo ""
  echo "📌 NOTE: Historical migrations (already on main) are grandfathered - only NEW migrations are validated."
fi

if [ ${#NON_IDEMPOTENT_ALTER_TYPE_FILES[@]} -gt 0 ]; then
  echo -e "\n${RED}❌ Non-Idempotent ALTER TYPE Detected${NC}"
  echo -e "${RED}Found ${#NON_IDEMPOTENT_ALTER_TYPE_FILES[@]} migration file(s) with ALTER TYPE ADD VALUE missing IF NOT EXISTS:${NC}"
  for file in "${NON_IDEMPOTENT_ALTER_TYPE_FILES[@]}"; do
    echo -e "  ${RED}- ${file}${NC}"
  done
  echo ""
  echo -e "${YELLOW}⚠️  ALTER TYPE ADD VALUE MUST include IF NOT EXISTS!${NC}"
  echo ""
  echo "This will cause:"
  echo "  - Migration failures when re-running (enum value already exists)"
  echo "  - CI test failures"
  echo "  - Production deployment failures"
  echo ""
  echo "To fix:"
  echo "  ❌ WRONG: ALTER TYPE user_status ADD VALUE 'suspended';"
  echo "  ✅ RIGHT: ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'suspended';"
  echo ""
  echo "Why: Migrations must be idempotent (safe to run multiple times)."
  echo ""
  echo "📌 NOTE: Historical migrations (already on main) are grandfathered - only NEW migrations are validated."
fi

exit $EXIT_CODE
