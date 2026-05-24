#!/usr/bin/env bash
# setup-swarm.sh — Idempotent swarm permission verifier
#
# Run from repo root before launching a ruflo-coordinated swarm session.
# Does NOT install ruflo (requires user-level `claude mcp add` — see below).
# Does NOT modify .claude/settings.json (committed file; do not touch).
# Merges swarm allowlist into .claude/settings.local.json (gitignored, per-machine).
#
# Usage: ./scripts/setup-swarm.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_FILE="$REPO_ROOT/.claude/settings.swarm.example.json"
LOCAL_FILE="$REPO_ROOT/.claude/settings.local.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[ok]${NC}   $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*"; }

echo ""
echo "=== Jovie Swarm Setup ==="
echo ""

# ── 1. Check ruflo MCP is registered ─────────────────────────────────────────
echo "Checking ruflo MCP..."

RUFLO_ACTIVE=false
if command -v claude &>/dev/null; then
  # claude mcp list exits 0 and prints registered servers
  if claude mcp list 2>/dev/null | grep -q "ruflo"; then
    ok "ruflo MCP is registered"
    RUFLO_ACTIVE=true
  fi
fi

if [ "$RUFLO_ACTIVE" = false ]; then
  warn "ruflo MCP not detected. To install:"
  echo ""
  echo "    claude mcp add ruflo -- npx ruflo@latest mcp start"
  echo ""
  echo "  After installing, re-run this script."
  echo ""
fi

# ── 2. Check / merge swarm allowlist into settings.local.json ─────────────────
echo "Checking swarm permission allowlist..."

SWARM_PERMS='["Bash(*)", "mcp__ruflo__*", "Read(*)", "Edit(*)", "Write(*)", "Glob(*)", "Grep(*)", "Skill(*)", "SlashCommand(*)", "Agent(*)"]'

# Check if all swarm perms are already present
ALL_PRESENT=true
for perm in 'Bash(*)' 'mcp__ruflo__*' 'Agent(*)' 'Skill(*)'; do
  if ! grep -q "\"$perm\"" "$LOCAL_FILE" 2>/dev/null; then
    ALL_PRESENT=false
    break
  fi
done

if [ "$ALL_PRESENT" = true ]; then
  ok "Swarm allowlist already present in $LOCAL_FILE"
else
  # Try to merge with jq
  if command -v jq &>/dev/null; then
    echo "Merging swarm allowlist into $LOCAL_FILE with jq..."

    if [ ! -f "$LOCAL_FILE" ]; then
      # Create minimal settings.local.json
      echo '{"permissions":{"allow":[]}}' > "$LOCAL_FILE"
    fi

    # Merge: add swarm perms that aren't already in the allow list
    SWARM_ALLOW="$(jq '.permissions.allow' "$EXAMPLE_FILE")"
    MERGED=$(jq \
      --argjson newperms "$SWARM_ALLOW" \
      '.permissions.allow = ((.permissions.allow // []) + $newperms | unique)' \
      "$LOCAL_FILE")

    echo "$MERGED" > "$LOCAL_FILE"
    ok "Swarm allowlist merged into $LOCAL_FILE"
  else
    warn "jq not found. Cannot auto-merge. To fix:"
    echo ""
    echo "  1. Install jq:  brew install jq"
    echo "  2. Re-run this script, OR"
    echo "  3. Manually add the entries from $EXAMPLE_FILE"
    echo "     into the permissions.allow array in $LOCAL_FILE"
    echo ""
  fi
fi

# ── 3. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== Next Steps ==="
echo ""
echo "  Swarm permissions ready (or see warnings above)."
echo ""
echo "  Use the Agent tool with pre-created worktrees per .claude/rules/swarm.md:"
echo ""
echo "    # Lead creates worktrees SEQUENTIALLY"
echo "    git worktree add /private/tmp/jovie-worktrees/<slug> -b tim/<slug> origin/main"
echo ""
echo "    # Then spawn coder agents in parallel via Agent()"
echo "    #   subagent_type: general-purpose"
echo "    #   model: claude-sonnet-4-6"
echo "    #   mode: bypassPermissions"
echo "    #   run_in_background: true"
echo ""
echo "  Full pattern: .claude/rules/swarm.md"
echo "  Permission template: .claude/settings.swarm.example.json"
echo ""

exit 0
