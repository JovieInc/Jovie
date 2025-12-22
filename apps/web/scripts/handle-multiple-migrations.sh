#!/usr/bin/env bash
# Helper script to handle multiple migrations in a PR
# Usage: ./scripts/handle-multiple-migrations.sh [--bulk|--skip|--info]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current branch and PR number
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
PR_NUMBER=""

if [ -z "$BRANCH" ]; then
    echo -e "${RED}❌ Not on a git branch${NC}"
    exit 1
fi

# Try to find PR number from branch
if command -v gh > /dev/null 2>&1; then
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
fi

# Count migrations added in this branch
MIGRATIONS_DIR="drizzle/migrations"
BASE_BRANCH="origin/main"

if ! git rev-parse --verify "$BASE_BRANCH" > /dev/null 2>&1; then
    BASE_BRANCH="main"
fi

ADDED_MIGRATIONS=$(git diff --name-status "$BASE_BRANCH"...HEAD -- "$MIGRATIONS_DIR" 2>/dev/null | grep -E '^A.*\.(sql|ts)$' | grep -v meta/ | wc -l | tr -d ' ')

# Parse command
COMMAND=${1:-"--info"}

case "$COMMAND" in
    --info)
        echo -e "${BLUE}📊 Migration Status for Branch: $BRANCH${NC}"
        echo ""
        echo "  Added migrations: $ADDED_MIGRATIONS"

        if [ -n "$PR_NUMBER" ]; then
            echo "  PR number: #$PR_NUMBER"

            # Show current labels
            CURRENT_LABELS=$(gh pr view "$PR_NUMBER" --json labels --jq '.labels[].name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
            if [ -n "$CURRENT_LABELS" ]; then
                echo "  Current labels: $CURRENT_LABELS"
            else
                echo "  Current labels: (none)"
            fi
        else
            echo "  PR: Not found (create PR first)"
        fi

        echo ""

        if [ "$ADDED_MIGRATIONS" -eq 0 ]; then
            echo -e "${GREEN}✅ No migrations added - migration guard will pass${NC}"
        elif [ "$ADDED_MIGRATIONS" -eq 1 ]; then
            echo -e "${GREEN}✅ One migration added - migration guard will pass${NC}"
        else
            echo -e "${YELLOW}⚠️  Multiple migrations detected ($ADDED_MIGRATIONS)${NC}"
            echo ""
            echo "Migration guard will FAIL unless you add a label:"
            echo ""
            echo "Options:"
            echo "  1. ${GREEN}schema:bulk${NC} - Allows multiple migrations, still validates each"
            echo "     Use when: Intentionally adding multiple related migrations"
            echo "     Command: ${BLUE}$0 --bulk${NC}"
            echo ""
            echo "  2. ${YELLOW}skip-migration-guard${NC} - Completely bypasses all migration checks"
            echo "     Use when: Fixing migration issues (like PR #1070)"
            echo "     Command: ${BLUE}$0 --skip${NC}"
            echo ""
        fi
        ;;

    --bulk)
        if [ -z "$PR_NUMBER" ]; then
            echo -e "${RED}❌ No PR found for branch '$BRANCH'${NC}"
            echo "Create a PR first: gh pr create"
            exit 1
        fi

        echo -e "${BLUE}Adding 'schema:bulk' label to PR #$PR_NUMBER${NC}"
        gh pr edit "$PR_NUMBER" --add-label "schema:bulk"

        echo -e "${GREEN}✅ Label added successfully${NC}"
        echo ""
        echo "Migration guard will now:"
        echo "  ✅ Allow multiple migrations in this PR"
        echo "  ✅ Still validate each migration individually"
        echo "  ✅ Check for CONCURRENTLY keyword"
        echo "  ✅ Verify migrations are registered in _journal.json"
        ;;

    --skip)
        if [ -z "$PR_NUMBER" ]; then
            echo -e "${RED}❌ No PR found for branch '$BRANCH'${NC}"
            echo "Create a PR first: gh pr create"
            exit 1
        fi

        echo -e "${YELLOW}⚠️  Adding 'skip-migration-guard' label to PR #$PR_NUMBER${NC}"
        echo ""
        echo "This will COMPLETELY BYPASS all migration validation."
        echo "Only use this when:"
        echo "  - Fixing broken migrations (like removing CONCURRENTLY)"
        echo "  - Cleaning up migration conflicts"
        echo "  - Schema consolidation approved by team"
        echo ""
        read -p "Are you sure? (y/N) " -n 1 -r
        echo

        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Cancelled."
            exit 0
        fi

        gh pr edit "$PR_NUMBER" --add-label "skip-migration-guard"

        echo -e "${GREEN}✅ Label added successfully${NC}"
        echo ""
        echo -e "${RED}⚠️  ALL migration checks are now disabled for this PR${NC}"
        ;;

    --help|-h)
        echo "Usage: $0 [--info|--bulk|--skip|--help]"
        echo ""
        echo "Helper script for handling multiple migrations in a PR"
        echo ""
        echo "Commands:"
        echo "  --info    Show migration status and available options (default)"
        echo "  --bulk    Add 'schema:bulk' label to allow multiple migrations"
        echo "  --skip    Add 'skip-migration-guard' label to bypass all checks"
        echo "  --help    Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                # Show status"
        echo "  $0 --bulk         # Add schema:bulk label"
        echo "  $0 --skip         # Add skip-migration-guard label (with confirmation)"
        ;;

    *)
        echo -e "${RED}❌ Unknown command: $COMMAND${NC}"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
