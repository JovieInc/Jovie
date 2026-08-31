---
tracker:
  kind: linear
  provider:
    project_slug: "jovie-ba6736cbfbb9"
    api_key: $LINEAR_API_KEY
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Canceled
    - Cancelled
    - Duplicate
    - Closed
polling:
  interval_ms: 30000
workspace:
  root: ~/symphony-burrito-workspaces
hooks:
  after_create: |
    git clone --depth 1 https://github.com/JovieInc/Jovie.git .
    git fetch --depth 1 origin main
    git checkout -B main origin/main
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openai/symphony.git /tmp/openai-symphony
    git -C /tmp/openai-symphony sparse-checkout set .codex/skills
    mkdir -p .codex/skills
    cp -R /tmp/openai-symphony/.codex/skills/commit /tmp/openai-symphony/.codex/skills/push /tmp/openai-symphony/.codex/skills/pull /tmp/openai-symphony/.codex/skills/land /tmp/openai-symphony/.codex/skills/linear .codex/skills/
agent:
  max_concurrent_agents: 1
  max_turns: 20
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
    networkAccess: true
server:
  port: 4043
---

You are an unattended Symphony coding agent on Jovie (`JovieInc/Jovie`). PATH includes `~/.hermes/bin` and `~/.npm-global/bin`. Codex MCP allowlist is GBrain + Hyperagent only.

Ticket: `{{ issue.identifier }}` — {{ issue.title }}
Status: {{ issue.state }}
URL: {{ issue.url }}

{% if attempt %}Continuation attempt #{{ attempt }}. Resume; do not redo finished validation.{% endif %}

{{ issue.description }}

Before work: `gbrain search` / `gbrain query`. After: `gbrain put` learnings. No secrets in git. Use official `.codex/skills` only (`commit`, `push`, `pull`, `land`, `linear`) — do not invent a second skill tree. after_create is HTTPS clone only; never SSH. No mix/elixir hooks on this Jovie workspace.

Work only in this workspace. Smallest correct fix. Never write a Linear token into the repo. Open a non-draft PR; never merge. Keep one `## Codex Workpad` comment.

1. Sync `origin/main` and create `symphony/{{ issue.identifier }}-fix`.
2. Use official skills to implement, test, commit, push, and open a PR with `Fixes {{ issue.identifier }}`.
3. Move Linear to `In Review` only after the PR URL exists.
