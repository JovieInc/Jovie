#!/bin/bash

# Migration Guard for Jovie
# Enforces append-only, linear migration history for Drizzle migrations
# Usage: ./scripts/check-migrations.sh [base-branch]

set -e

# Configuration
MIGRATIONS_DIR="drizzle/migrations"
BASE_BRANCH=${1:-"origin/preview"}
BULK_LABEL_MARKER="schema:bulk"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_error() {
    echo -e "${RED}❌ Migration Guard: $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✅ Migration Guard: $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  Migration Guard: $1${NC}"
}

log_info() {
    echo "ℹ️  Migration Guard: $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not in a git repository"
    exit 1
fi

# Check if base branch exists
if ! git rev-parse --verify "$BASE_BRANCH" > /dev/null 2>&1; then
    log_warning "Base branch '$BASE_BRANCH' not found. Using HEAD~1 as fallback."
    BASE_BRANCH="HEAD~1"
fi

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    log_info "No migrations directory found at '$MIGRATIONS_DIR'. Skipping migration checks."
    exit 0
fi

log_info "Checking migrations against base: $BASE_BRANCH"

# Get list of changed files in migrations directory
CHANGED_FILES=$(git diff --name-status "$BASE_BRANCH"...HEAD -- "$MIGRATIONS_DIR" 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
    log_success "No migration changes detected"
    exit 0
fi

echo "Changed files in migrations:"
echo "$CHANGED_FILES"
echo

# Initialize counters and arrays
DELETED_COUNT=0
MODIFIED_COUNT=0
ADDED_COUNT=0
DELETED_FILES=()
MODIFIED_FILES=()
ADDED_FILES=()

# Process each changed file
while IFS=$'\t' read -r status file; do
    # Skip if not a migration file
    if [[ ! "$file" =~ ^drizzle/migrations/.*\.(sql|ts)$ ]]; then
        continue
    fi
    
    # Skip meta files
    if [[ "$file" =~ meta/ ]]; then
        continue
    fi
    
    case "$status" in
        D*)
            DELETED_COUNT=$((DELETED_COUNT + 1))
            DELETED_FILES+=("$file")
            ;;
        M*)
            MODIFIED_COUNT=$((MODIFIED_COUNT + 1))
            MODIFIED_FILES+=("$file")
            ;;
        A*)
            ADDED_COUNT=$((ADDED_COUNT + 1))
            ADDED_FILES+=("$file")
            ;;
    esac
done <<< "$CHANGED_FILES"

# Check for violations
VIOLATIONS=0

# 1. Check for deleted migrations
if [ $DELETED_COUNT -gt 0 ]; then
    log_error "Found $DELETED_COUNT deleted migration file(s):"
    for file in "${DELETED_FILES[@]}"; do
        echo "  - $file"
    done
    echo
    echo "❌ VIOLATION: Deleting migration files breaks linear history."
    echo "   Instead: Create a new migration to undo changes if needed."
    echo
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# 2. Check for modified migrations
if [ $MODIFIED_COUNT -gt 0 ]; then
    log_error "Found $MODIFIED_COUNT modified migration file(s):"
    for file in "${MODIFIED_FILES[@]}"; do
        echo "  - $file"
    done
    echo
    echo "❌ VIOLATION: Modifying existing migrations breaks linear history."
    echo "   Instead: Create a new migration to adjust the schema."
    echo
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# 3. Check for too many new migrations (unless bulk label present)
if [ $ADDED_COUNT -gt 1 ]; then
    # Check if this is a PR context with bulk label
    HAS_BULK_LABEL=false
    
    # In GitHub Actions, check for label
    if [ -n "$GITHUB_EVENT_PATH" ] && [ -f "$GITHUB_EVENT_PATH" ]; then
        if command -v jq > /dev/null 2>&1; then
            LABELS=$(jq -r '.pull_request.labels[].name // empty' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
            if echo "$LABELS" | grep -q "$BULK_LABEL_MARKER"; then
                HAS_BULK_LABEL=true
            fi
        fi
    fi
    
    # In local development, check git branch name or commit message for bulk indicator
    if [ "$HAS_BULK_LABEL" = false ]; then
        BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "")
        COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")
        
        if [[ "$BRANCH_NAME" =~ schema.*bulk ]] || [[ "$COMMIT_MSG" =~ schema.*bulk ]]; then
            HAS_BULK_LABEL=true
        fi
    fi
    
    if [ "$HAS_BULK_LABEL" = false ]; then
        log_error "Found $ADDED_COUNT new migration files (max 1 allowed):"
        for file in "${ADDED_FILES[@]}"; do
            echo "  - $file"
        done
        echo
        echo "❌ VIOLATION: Multiple migrations per PR increase merge conflict risk."
        echo "   Solutions:"
        echo "   1. Split into separate PRs (recommended)"
        echo "   2. Add 'schema:bulk' label to PR"
        echo "   3. Use branch name containing 'schema-bulk'"
        echo
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        log_warning "Multiple migrations detected but 'schema:bulk' label/marker found. Proceeding."
    fi
fi

# 4. Validate new migration timestamps
if [ $ADDED_COUNT -gt 0 ]; then
    log_info "Validating new migration timestamps..."
    
    # Get the latest existing migration number/timestamp
    LATEST_MIGRATION_NUMBER=""
    LATEST_TIMESTAMP=""
    if [ -d "$MIGRATIONS_DIR" ]; then
        # Find all existing migration files (not the new ones being added)
        EXISTING_MIGRATIONS=$(git ls-tree -r --name-only "$BASE_BRANCH" -- "$MIGRATIONS_DIR" 2>/dev/null | grep -E '\.(sql|ts)$' | grep -v meta/ || echo "")
        
        if [ -n "$EXISTING_MIGRATIONS" ]; then
            # Extract numbers/timestamps and find the latest
            while read -r migration_file; do
                filename=$(basename "$migration_file")
                # Handle Drizzle Kit format (0000_name.sql)
                if [[ "$filename" =~ ^([0-9]{4})_ ]]; then
                    MIGRATION_NUM="${BASH_REMATCH[1]}"
                    if [ -z "$LATEST_MIGRATION_NUMBER" ] || [ "$MIGRATION_NUM" -gt "$LATEST_MIGRATION_NUMBER" ]; then
                        LATEST_MIGRATION_NUMBER="$MIGRATION_NUM"
                    fi
                # Handle timestamp format (YYYYMMDDHHMM_name.sql)
                elif [[ "$filename" =~ ^([0-9]{12})_ ]]; then
                    TIMESTAMP="${BASH_REMATCH[1]}"
                    if [ -z "$LATEST_TIMESTAMP" ] || [ "$TIMESTAMP" -gt "$LATEST_TIMESTAMP" ]; then
                        LATEST_TIMESTAMP="$TIMESTAMP"
                    fi
                fi
            done <<< "$EXISTING_MIGRATIONS"
        fi
    fi
    
    # Check each new migration
    for file in "${ADDED_FILES[@]}"; do
        filename=$(basename "$file")
        
        # Validate filename format - support both Drizzle Kit format and timestamp format
        if [[ ! "$filename" =~ ^[0-9]{4}_.+\.(sql|ts)$ ]] && [[ ! "$filename" =~ ^[0-9]{12}_.+\.(sql|ts)$ ]]; then
            log_error "Invalid migration filename format: $filename"
            echo "   Expected formats:"
            echo "   - Drizzle Kit: 0000_description.sql"
            echo "   - Timestamp: YYYYMMDDHHMM_description.sql"
            echo
            VIOLATIONS=$((VIOLATIONS + 1))
            continue
        fi
        
        # Validate ordering for different migration formats
        if [[ "$filename" =~ ^([0-9]{4})_ ]]; then
            # Drizzle Kit format (0000_name.sql)
            NEW_MIGRATION_NUMBER="${BASH_REMATCH[1]}"
            
            # Validate number is greater than latest existing Drizzle migration
            if [ -n "$LATEST_MIGRATION_NUMBER" ] && [ "$NEW_MIGRATION_NUMBER" -le "$LATEST_MIGRATION_NUMBER" ]; then
                log_error "Migration number conflict: $filename"
                echo "   New migration number: $NEW_MIGRATION_NUMBER"
                echo "   Latest existing: $LATEST_MIGRATION_NUMBER"
                echo "   New migrations must have numbers > existing ones"
                echo
                VIOLATIONS=$((VIOLATIONS + 1))
            fi
            
        elif [[ "$filename" =~ ^([0-9]{12})_ ]]; then
            # Timestamp format (YYYYMMDDHHMM_name.sql)
            NEW_TIMESTAMP="${BASH_REMATCH[1]}"
            
            # Validate timestamp is in the future relative to latest existing
            if [ -n "$LATEST_TIMESTAMP" ] && [ "$NEW_TIMESTAMP" -le "$LATEST_TIMESTAMP" ]; then
                log_error "Migration timestamp conflict: $filename"
                echo "   New timestamp: $NEW_TIMESTAMP"
                echo "   Latest existing: $LATEST_TIMESTAMP"
                echo "   New migrations must have timestamps > existing ones"
                echo
                VIOLATIONS=$((VIOLATIONS + 1))
            fi
            
            # Basic timestamp format validation (YYYYMMDDHHMM)
            YEAR=${NEW_TIMESTAMP:0:4}
            MONTH=${NEW_TIMESTAMP:4:2}
            DAY=${NEW_TIMESTAMP:6:2}
            HOUR=${NEW_TIMESTAMP:8:2}
            MINUTE=${NEW_TIMESTAMP:10:2}
            
            if [ "$YEAR" -lt 2024 ] || [ "$YEAR" -gt 2030 ] || 
               [ "$MONTH" -lt 1 ] || [ "$MONTH" -gt 12 ] ||
               [ "$DAY" -lt 1 ] || [ "$DAY" -gt 31 ] ||
               [ "$HOUR" -gt 23 ] || [ "$MINUTE" -gt 59 ]; then
                log_error "Invalid timestamp in filename: $filename"
                echo "   Timestamp $NEW_TIMESTAMP is not a valid YYYYMMDDHHMM format"
                echo
                VIOLATIONS=$((VIOLATIONS + 1))
            fi
        fi
    done
fi

# Summary
echo "════════════════════════════════════════════════════════════════════════"
echo "Migration Guard Summary:"
echo "  Deleted: $DELETED_COUNT files"
echo "  Modified: $MODIFIED_COUNT files" 
echo "  Added: $ADDED_COUNT files"
echo "  Violations: $VIOLATIONS"
echo "════════════════════════════════════════════════════════════════════════"

if [ $VIOLATIONS -gt 0 ]; then
    log_error "Migration guard failed with $VIOLATIONS violation(s)"
    echo
    echo "📖 Migration Policy Reminder:"
    echo "   • Migrations must be append-only and linear"
    echo "   • Never edit or delete existing migration files"
    echo "   • Create new migrations to fix schema issues"
    echo "   • Use 'schema:bulk' label for multiple migrations per PR"
    echo "   • Filename format: YYYYMMDDHHMM_description.sql"
    echo
    exit 1
else
    log_success "All migration checks passed!"
    exit 0
fi