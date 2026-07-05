#!/bin/bash
# Warn before dangerous bash commands
# Based on AGENTS.md guardrails
# Synced with .claude/hooks/bash-safety-check.sh

# Get the command from the tool input (same as Claude)
command=$(jq -r '.tool_input.command // empty' 2>/dev/null)

# If parsing fails or no command, allow (fail open)
if [ -z "$command" ]; then
  exit 0
fi

# List of dangerous patterns from AGENTS.md
dangerous_patterns=(
  # System destruction
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \."

  # Protected branch force pushes (AGENTS.md line 50)
  "git push --force.*main"
  "git push --force.*master"
  "git push -f.*main"
  "git push -f.*master"
  "git push.*main.*--force"
  "git push.*master.*--force"

  # Direct pushes to main (AGENTS.md line 8)
  "^git push origin main"
  "^git push origin master"

  # Publishing
  "npm publish"
  "pnpm publish"

  # System-level dangerous
  "> /dev/"
  "dd if="
  "mkfs"
  "shutdown"
  "reboot"
  "chmod -R 777"
  "chown -R"
)

# Check for dangerous patterns
for pattern in "${dangerous_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "BLOCKED: Potentially destructive command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    echo "If you're sure you want to run this command, please run it manually."
    exit 2  # Exit 2 blocks in Windsurf
  fi
done

# Block checkout/switch in the primary Jovie dispatcher repo (#12841).
primary_repo="${HERMES_JOVIE_REPO:-${HOME}/Jovie}"
if echo "$command" | grep -qE '(^|[;&|[:space:]])(git checkout|git switch|gh pr checkout)([[:space:]]|$)'; then
  if echo "$command" | grep -qF "$primary_repo" \
    || echo "$command" | grep -qE '(^|[[:space:]])~/Jovie([[:space:]/]|$)' \
    || echo "$command" | grep -qE "git -C[[:space:]]+['\"]?${primary_repo}"; then
    echo "BLOCKED: git checkout/switch in primary Jovie repo"
    echo "Primary repo: $primary_repo"
    echo "Command: $command"
    echo ""
    echo "Use an isolated worktree for branch work. Never hijack the shipper checkout."
    exit 2
  fi
fi

# Warn about potentially risky commands (but don't block)
risky_patterns=(
  "rm -rf"
  "git push --force"
  "git push -f"
  "DROP TABLE"
  "DROP DATABASE"
  "DELETE FROM.*WHERE"
)

for pattern in "${risky_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "WARNING: Potentially risky command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    # Don't exit, just warn
  fi
done

exit 0
