#!/bin/bash
# Block non-coding orchestration profiles from editing product code.
#
# This hook is intentionally inert unless a launcher sets one of the profile
# environment variables below. Hermes/Conductor should set JOVIE_AGENT_PROFILE
# before starting Claude Code/Codex sessions so profile drift becomes a hard
# gate instead of a memory test.

if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
else
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ]; then
  exit 0
fi

profile="${JOVIE_AGENT_PROFILE:-${HERMES_PROFILE:-${HERMES_AGENT_PROFILE:-${CLAUDE_AGENT_ROLE:-${AGENT_PROFILE:-}}}}}"
profile="$(printf '%s' "$profile" | tr '[:upper:]' '[:lower:]')"

if [ -z "$profile" ]; then
  exit 0
fi

case "$profile" in
  default|chief|chief-of-staff|chief_of_staff|cfo|cfo-milan-v2|founder-os|code-orchestrator|orchestrator)
    ;;
  *)
    exit 0
    ;;
esac

case "$file_path" in
  apps/web/*|packages/*|drizzle/*|.github/workflows/*|proxy.ts|tailwind.config.ts|next.config.js|package.json|pnpm-lock.yaml|turbo.json)
    echo "BLOCKED: Non-coding profile cannot edit product or CI code"
    echo "Profile: $profile"
    echo "File: $file_path"
    echo ""
    echo "Chief of Staff, CFO, Founder OS, and Code Orchestrator profiles must create"
    echo "or update a HUD/delegation manifest and dispatch an authorized coder profile."
    echo ""
    echo "Required manifest fields:"
    echo "  hud_id, kpi, owner, hermes_profile, runtime, model_route, worktree,"
    echo "  gstack_skills, gbrain_queries, hard_gates, expected_output, verification"
    exit 1
    ;;
esac

exit 0
