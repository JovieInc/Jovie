#!/bin/bash
# Infrastructure Guardrails (agents.md: Infrastructure & Scheduling Guardrails)
# - Block creation of new cron jobs without explicit justification
# - Block vercel.json cron config changes
# - Detect polling patterns (setInterval/setTimeout in server code)
# - Warn on new external API client usage in scheduled contexts

# Resolve paths against repo root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Get file path and content from tool input
if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
  content=$(echo "$TOOL_INPUT" | jq -r '.content // .new_string // empty' 2>/dev/null)
else
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
  content=$(echo "$TOOL_INPUT" | grep -oP '"(content|new_string)"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ]; then
  exit 0
fi

# HARD GUARDRAIL: No new cron job routes without approval
# Check if creating a NEW file under app/api/cron/
if [[ "$file_path" =~ app/api/cron/ ]] && [[ "$file_path" =~ route\.ts$ ]]; then
  # Check if this is a new file (doesn't exist yet)
  if [ ! -f "$REPO_ROOT/$file_path" ]; then
    echo "🚨 BLOCKED: Creating new cron job requires explicit approval"
    echo "File: $file_path"
    echo ""
    echo "Before creating a new cron job, you MUST justify why simpler alternatives won't work."
    echo "Walk through the decision hierarchy (agents.md: Infrastructure & Scheduling Guardrails):"
    echo ""
    echo "  1. Can a webhook/event handler do this instead?"
    echo "  2. Can this happen inline after the triggering action?"
    echo "  3. Can this be lazy-evaluated when data is next accessed?"
    echo "  4. Can this be added to an EXISTING cron job?"
    echo "  5. Only if all above fail: create a new cron job with PR justification."
    echo ""
    echo "If you still need a new cron job, ask the user for explicit approval first."
    exit 1
  fi
fi

# HARD GUARDRAIL: vercel.json cron modifications require approval
if [[ "$file_path" =~ vercel\.json$ ]] && [ -n "$content" ]; then
  if echo "$content" | grep -qiE '"crons"|"schedule"|"cron"'; then
    echo "🚨 BLOCKED: Modifying Vercel cron configuration requires explicit approval"
    echo "File: $file_path"
    echo ""
    echo "Changes to cron schedules or adding new cron entries have direct cost"
    echo "and operational impact. See agents.md: Infrastructure & Scheduling Guardrails."
    echo ""
    echo "Required in PR description:"
    echo "  - Why a webhook/event-driven approach won't work"
    echo "  - Expected API call volume and cost impact"
    echo "  - Proposed frequency and why that frequency is necessary"
    echo ""
    echo "Ask the user for explicit approval before modifying cron configuration."
    exit 1
  fi
fi

# WARN: setInterval/setTimeout in server-side code (not client components)
if [ -n "$content" ]; then
  if echo "$content" | grep -qE '(setInterval|setTimeout)\s*\('; then
    # Skip if this is clearly a client component or test file
    if [[ ! "$file_path" =~ \.test\. ]] && [[ ! "$file_path" =~ \.spec\. ]] && [[ ! "$file_path" =~ __tests__ ]]; then
      # Check if file has 'use client' directive — if so, allow it
      if ! echo "$content" | head -5 | grep -q "'use client'"; then
        if [[ "$file_path" =~ app/api/ ]] || [[ "$file_path" =~ lib/ ]] || [[ "$file_path" =~ server ]]; then
          echo "⚠️  WARNING: setInterval/setTimeout detected in server-side code"
          echo "File: $file_path"
          echo ""
          echo "Timers in serverless functions silently fail — the function terminates"
          echo "before the timer fires. Use Vercel Cron or the in-database job queue instead."
          echo ""
          echo "If this is intentional (e.g., a short timeout for an API call), ignore this warning."
          # Warning only, don't block
        fi
      fi
    fi
  fi
fi

# WARN: New external API client imports in cron/scheduled contexts
if [[ "$file_path" =~ app/api/cron/ ]] && [ -n "$content" ]; then
  # Check for patterns that suggest iterating over users to call external APIs
  if echo "$content" | grep -qE '(for\s*\(|\.forEach|\.map)\s*.*\b(stripe|clerk|resend)\b' || \
     echo "$content" | grep -qE '\b(stripe|clerk|resend)\b.*\.(for|forEach|map)\s*\('; then
    echo "⚠️  WARNING: Possible per-user external API call loop in cron job"
    echo "File: $file_path"
    echo ""
    echo "Iterating over users to call external APIs (Stripe, Clerk, Resend)"
    echo "in a cron job creates O(users) API calls per run."
    echo ""
    echo "At 1,000 users running hourly = 24,000 API calls/day."
    echo "At 10,000 users = 240,000 API calls/day."
    echo ""
    echo "Consider: Can webhooks handle this reactively instead of polling?"
    echo "If bulk API calls are truly needed, use batch/list endpoints."
  fi
fi

# SUCCESS: Infrastructure check passed
exit 0
