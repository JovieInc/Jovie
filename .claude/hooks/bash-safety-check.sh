#!/bin/bash
# Warn before dangerous bash commands
# Based on AGENTS.md guardrails

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

# Block checkout/switch in the primary Jovie shipper checkout (#12841).
# Agents must use isolated worktrees; hijacking ~/Jovie silently runs stale
# dispatcher code while agent worktrees still fetch origin/main.
primary_repo="${HERMES_JOVIE_REPO:-}"
if [ -z "$primary_repo" ]; then
  for candidate in "${HOME}/Jovie" "${HOME}/jovie"; do
    if [ -d "$candidate/.git" ]; then
      primary_repo="$candidate"
      break
    fi
  done
fi
if [ -n "$primary_repo" ]; then
  if echo "$command" | grep -qE '(^|[[:space:]])(git checkout|git switch|gh pr checkout)'; then
    if echo "$command" | grep -qF "$primary_repo"; then
      echo "🚨 BLOCKED: git checkout/switch in primary Jovie repo ($primary_repo)"
      echo "Use an isolated worktree for branch work. Hijacking the shipper checkout runs stale dispatcher code."
      echo "Command: $command"
      exit 1
    fi
    if echo "$command" | grep -qE '(^|[[:space:]])(git checkout|git switch)([[:space:]]|$)'; then
      if [ "$(pwd -P 2>/dev/null)" = "$(cd "$primary_repo" && pwd -P 2>/dev/null)" ]; then
        echo "🚨 BLOCKED: git checkout/switch while cwd is primary Jovie repo ($primary_repo)"
        echo "Use an isolated worktree for branch work."
        echo "Command: $command"
        exit 1
      fi
    fi
  fi
fi

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

# Block git checkout/switch in the primary Jovie shipper checkout (#12841).
# Agents must use isolated worktrees — hijacking ~/Jovie silently regresses
# the dispatcher while agents still get fresh worktrees from origin/main.
primary_repo="${HERMES_JOVIE_REPO:-${HOME}/Jovie}"
if echo "$command" | grep -qE '(^|[;&|[:space:]])(git checkout|git switch|gh pr checkout)'; then
  if echo "$command" | grep -qF "$primary_repo"; then
    echo "🚨 BLOCKED: git checkout/switch in primary Jovie repo ($primary_repo)"
    echo "Use isolated worktrees only. Hijacking the shipper checkout runs stale dispatcher code."
    echo "Command: $command"
    exit 1
  fi
  if echo "$command" | grep -qE '(^|[[:space:]])(cd|pushd)[[:space:]]+.*Jovie'; then
    if ! echo "$command" | grep -qE 'worktree'; then
      echo "🚨 BLOCKED: likely git checkout in primary ~/Jovie checkout"
      echo "Use isolated worktrees only (git worktree add ...)."
      echo "Command: $command"
      exit 1
    fi
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
    echo "⚠️  WARNING: Potentially risky command detected"
    echo "Pattern: $pattern"
    echo "Command: $command"
    echo ""
    # Don't exit, just warn
  fi
done

exit 0