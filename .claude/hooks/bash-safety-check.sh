#!/bin/bash
# Warn before dangerous bash commands
# Based on agents.md guardrails

# Get the command from the tool input (TOOL_INPUT is a JSON string passed via env)
# Support both jq and fallback parsing for environments without jq
if command -v jq &> /dev/null; then
  command=$(echo "$TOOL_INPUT" | jq -r '.command // empty' 2>/dev/null)
else
  # Fallback: try to extract command with grep/sed (less reliable but works without jq)
  command=$(echo "$TOOL_INPUT" | grep -oP '"command"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$command" ]; then
  exit 0
fi

# List of dangerous patterns from agents.md
dangerous_patterns=(
  # System destruction
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \."

  # Protected branch force pushes (agents.md line 50)
  "git push --force.*main"
  "git push --force.*master"
  "git push -f.*main"
  "git push -f.*master"
  "git push.*main.*--force"
  "git push.*master.*--force"

  # Direct pushes to main (agents.md line 8)
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
    echo "🚨 BLOCKED: Potentially destructive command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    echo "If you're sure you want to run this command, please run it manually."
    exit 1
  fi
done

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
    echo "⚠️  WARNING: Potentially risky command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    # Don't exit, just warn
  fi
done

exit 0