# Fable 5 → Haiku Orchestration Pipeline

## Problem
Developer agent was running on Opus 4.8 ($15/task) when most work is
mechanical implementation. Planning (taste) and coding (execution) should
use different models.

## Solution

### Pipeline
1. **Zoe (OpenClaw)** — Specs the task completely in the seed message
2. **Fable 5 (HyperAgent)** — Plans, delegates to subagent, verifies results
3. **Haiku (subagent)** — Clones repo, writes files, commits, pushes, opens PR
4. **GitHub MCP** — Fallback when `git push`/`gh` CLI unavailable in sandbox

### Configuration
- HyperAgent agent: Developer
- Main model: Fable 5
- Subagent model: Haiku 4.5 (default)
- Budget: per-task limits in HyperAgent UI

### Cost
- ~60K subagent tokens, 38 tool calls, ~2.4 min per task
- ~$0.50/task vs $15/task on Opus (30× cheaper)
- No thinking/reflection overhead on simple tasks

### Key pattern
The seed message must include the complete spec — Fable 5 doesn't research,
it delegates. Clone instruction must be explicit since sandbox starts empty.
Mention GitHub MCP fallback in the spec since git/gh are often unavailable.

### Self-recovery
When `git push` fails (no creds) and `gh` is missing, the Haiku subagent
falls back to GitHub MCP tools: `github__create_branch` → `github__push_files`
→ `github__create_pull_request`. The spec should mention this fallback.