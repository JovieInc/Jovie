---
tracker:
  kind: linear
  provider:
    project_slug: "symphony-ui-pilot-96d6b9c5b2d5"
    api_key: $LINEAR_API_KEY
  required_labels:
    - symphony
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Done
    - Canceled
    - Cancelled
    - Duplicate
    - Closed
polling:
  interval_ms: 30000
workspace:
  root: ~/symphony-elixir-workspaces
hooks:
  timeout_ms: 900000
  after_create: |
    export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"
    git clone --depth 1 https://github.com/JovieInc/Jovie.git .
    git fetch --depth 1 origin main
    git checkout -B main origin/main
    skills_tmp="$(mktemp -d "${TMPDIR:-/tmp}/openai-symphony-skills.XXXXXX")"
    trap 'rm -rf "$skills_tmp"' EXIT
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openai/symphony.git "$skills_tmp"
    git -C "$skills_tmp" sparse-checkout set .codex/skills
    mkdir -p .codex/skills
    cp -R "$skills_tmp/.codex/skills/commit" "$skills_tmp/.codex/skills/push" "$skills_tmp/.codex/skills/pull" "$skills_tmp/.codex/skills/land" "$skills_tmp/.codex/skills/linear" .codex/skills/
    SYMPHONY_TRUSTED_HOOK_PHASE=after_create bash ./scripts/hermes/symphony-nvme-package-cache.sh after-create
  before_remove: |
    export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"
    if [ -f ./scripts/hermes/symphony-nvme-package-cache.sh ]; then
      SYMPHONY_TRUSTED_HOOK_PHASE=before_remove bash ./scripts/hermes/symphony-nvme-package-cache.sh before-remove
    else
      rm -rf ./node_modules ./.symphony/package-cache/pnpm-store
      find ./apps ./packages ./workers -mindepth 2 -maxdepth 2 -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
    fi
agent:
  max_concurrent_agents: 40
  max_turns: 20
codex:
  command: ./scripts/hermes/symphony-codex-router app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
    networkAccess: true
server:
  port: 4041
---

You are an unattended Symphony coding agent on Jovie (`JovieInc/Jovie`). PATH includes `~/.hermes/bin` and `~/.npm-global/bin`. Codex MCP allowlist is GBrain + Hyperagent only.

Ticket: `{{ issue.identifier }}` — {{ issue.title }}
Status: {{ issue.state }}
URL: {{ issue.url }}

{% if attempt %}Continuation attempt #{{ attempt }}. Resume; do not redo finished validation.{% endif %}

{{ issue.description }}

Before work: `gbrain search` / `gbrain query`. After: `gbrain put` learnings. No secrets in git. Use official `.codex/skills` only (`commit`, `push`, `pull`, `land`, `linear`) — do not invent a second skill tree. after_create is HTTPS clone only; never SSH. The trusted after_create hook alone may perform the one bounded `pnpm install --offline --frozen-lockfile --ignore-scripts` restore from immutable Gem NVMe into private mutable SATA workspace state before agent start; coding agents must not run package install/fetch commands or create package stores. No mix/elixir hooks on this Jovie workspace.

The app-server command is the repository routing launcher. It verifies the durable `symphony-routing/v1` receipt and launches the selected model instead of a fixed default.

Unattended git uses git + gh CLI only. Never GitHub MCP, never Codex Apps `create_branch`, never connector `76869538009648d5b282a4bb21c3d157` (meetjovie has `[apps.connector_76869538009648d5b282a4bb21c3d157] enabled=false`).

Work only in this workspace. Smallest correct fix. Never write a Linear token into the repo. Open a non-draft PR; never merge. Keep one `## Codex Workpad` comment.

1. Sync `origin/main` with `git` and create `symphony/{{ issue.identifier }}-fix` with `git checkout -b`.
2. Use official skills plus git + gh CLI to implement, test, commit, push, and open a PR with `Fixes {{ issue.identifier }}`.
3. Move Linear to `In Review` only after the PR URL exists.
