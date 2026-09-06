---
tracker:
  kind: linear
  provider:
    team_key: "JOV"
    api_key: $LINEAR_API_KEY
  excluded_labels:
    - no-symphony
  active_states:
    - Todo
    - In Progress
    - Rework
    - Merging
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
    exec "$HOME/.local/bin/jovie-symphony-workspace-create" "$PWD"
  before_remove: |
    export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"
    cache_status=0
    if [ -f ./scripts/symphony/symphony-nvme-package-cache.sh ]; then
      SYMPHONY_TRUSTED_HOOK_PHASE=before_remove bash ./scripts/symphony/symphony-nvme-package-cache.sh before-remove || cache_status=$?
    fi
    cleanup_status=0
    sudo -n /usr/local/sbin/jovie-symphony-workspace cleanup "$PWD" || cleanup_status=$?
    if [ "$cleanup_status" -ne 0 ]; then exit "$cleanup_status"; fi
    exit "$cache_status"
agent:
  max_concurrent_agents: 8
  max_turns: 20
codex:
  command: SYMPHONY_CODEX_DISABLE_APPS=1 symphony-agent-router app-server
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

Intake is the Jovie Linear team. States: `Todo` = queued (move to `In Progress` before work); `In Progress` = continue; `Rework` = address review feedback on the existing PR; `Merging` = land the attached PR through the native merge queue. Only the mechanical `no-symphony` dead-letter label excludes dispatch; legacy human-review labels never do. Admission stop-line: the source-owned runtime wrapper holds new dispatch while Summer's closure-health signal in the Gem fleet gate receipt is not healthy (missing or stale receipts hold too), and an issue that hits the bounded ceiling of permanent Linear 4xx errors is dead-lettered to a durable `symphony-issue-dead-letter/v1` receipt and must receive the `no-symphony` label before any further machine pickup. <!-- JOV-INV-028 -->

{% if attempt %}Continuation attempt #{{ attempt }}. Resume; do not redo finished validation.{% endif %}

{{ issue.description }}

Before work: `gbrain search` / `gbrain query`. After: `gbrain put` learnings. No secrets in git. Use official `.codex/skills` only (`commit`, `push`, `pull`, `land`, `linear`) — do not invent a second skill tree. after_create is HTTPS clone only; never SSH. The trusted after_create hook alone may perform the one bounded `pnpm install --offline --frozen-lockfile --ignore-scripts` restore from immutable Gem NVMe into private mutable SATA workspace state before agent start; coding agents must not run package install/fetch commands or create package stores. No mix/elixir hooks on this Jovie workspace.

The app-server command is the repository routing launcher. It verifies the durable `symphony-routing/v1` receipt and launches the selected model instead of a fixed default.

Unattended git uses git + gh CLI only. Never GitHub MCP, never Codex Apps `create_branch`, never connector `76869538009648d5b282a4bb21c3d157` (meetjovie has `[apps.connector_76869538009648d5b282a4bb21c3d157] enabled=false`).

Work only in this workspace. Smallest correct fix. Never write a Linear token into the repo. Open a non-draft PR; never merge. Keep one `## Codex Workpad` comment.

1. Sync `origin/main` with `git` and create `symphony/{{ issue.identifier }}-fix` with `git checkout -b`.
2. Use official skills plus git + gh CLI to implement, test, commit, push, and open a PR with `Fixes {{ issue.identifier }}`.
3. Move Linear to `In Review` only after the PR URL exists.
