#!/bin/bash
# Warn before dangerous bash commands
# Adapted for Windsurf - exit 2 to block
# Based on agents.md guardrails

# Get the command from stdin (Windsurf passes JSON via stdin)
input=$(cat)
command=$(echo "$input" | jq -r '.tool_info.command // .command // empty' 2>/dev/null)
jq_exit=$?

# Fail closed: block if JSON parsing failed
if [ "$jq_exit" -ne 0 ]; then
  echo "BLOCKED: Unable to parse command JSON for safety checks"
  exit 2
fi

# If input is non-empty but command is empty after successful parsing, treat as parse failure
if [ -n "$input" ] && [ -z "$command" ]; then
  echo "BLOCKED: Failed to extract command from input JSON"
  exit 2
fi

# If both input and command are empty, allow (no-op case)
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
    echo "BLOCKED: Potentially destructive command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    echo "If you're sure you want to run this command, please run it manually."
    exit 2  # Exit 2 blocks in Windsurf
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
    echo "WARNING: Potentially risky command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    # Don't exit, just warn
  fi
done

exit 0
