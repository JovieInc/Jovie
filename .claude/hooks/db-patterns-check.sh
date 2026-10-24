#!/bin/bash
set -euo pipefail
# db-patterns-check.sh - Check for forbidden database patterns after file edits
#
# This hook runs after Edit/Write operations to catch database anti-patterns
# that bypass our centralized database and atomicity contract.

# Get the file path from environment (set by Claude Code)
FILE="${TOOL_INPUT_FILE_PATH:-}"

# Exit early if no file path or not a TypeScript file
if [[ -z "$FILE" ]]; then
  exit 0
fi

if [[ ! "$FILE" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip if file doesn't exist (might have been deleted)
if [[ ! -f "$FILE" ]]; then
  exit 0
fi

# Skip lib/db internal files (they're allowed to use these patterns)
if [[ "$FILE" =~ lib/db/ ]]; then
  if [[ ! "$FILE" =~ /legacy-transaction\.ts$ ]] && grep -qE "\b(db|tx)\.transaction\(" "$FILE"; then
    echo 'Direct transaction must stay in lib/db/legacy-transaction.ts'
    exit 1
  fi
  exit 0
fi

ERRORS=()

# Check for db.transaction() usage (specific to db/tx objects)
if grep -qE "\b(db|tx)\.transaction\(" "$FILE" 2>/dev/null; then
  ERRORS+=("db.transaction() detected - Use runAtomicDbOperation for multi-statement invariants; direct transactions bypass certification.")
fi

# Check for manual pooling imports (ESM and CommonJS)
if grep -qE "from ['\"]pg['\"]|from ['\"]pg-pool['\"]|require\(['\"]pg['\"]\)|require\(['\"]pg-pool['\"]\)" "$FILE" 2>/dev/null; then
  ERRORS+=("Manual database pooling import detected (pg/pg-pool). Use: import { db } from '@/lib/db'")
fi

# Check for new Pool() instantiation
if grep -q "new Pool(" "$FILE" 2>/dev/null; then
  ERRORS+=("new Pool() detected - Manual pooling conflicts with Neon. Use: import { db } from '@/lib/db'")
fi

# Check for legacy client import
if grep -qE "from ['\"]@/lib/db/client['\"]" "$FILE" 2>/dev/null; then
  ERRORS+=("Legacy db/client import detected. Use: import { db } from '@/lib/db'")
fi

# Report errors
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "❌ Database pattern violations in $FILE:"
  echo ""
  for error in "${ERRORS[@]}"; do
    echo "  • $error"
  done
  echo ""
  echo "See AGENTS.md 'Database Access (Single Driver Policy)' for details."
  exit 1
fi

exit 0
