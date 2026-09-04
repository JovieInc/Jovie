---
tracker:
  kind: linear
  provider:
    team_key: "JOV"
    api_key: $LINEAR_API_KEY
  excluded_labels:
    - no-symphony
    - needs-human
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
    git clone --depth 1 https://github.com/JovieInc/Jovie.git .
    git fetch --depth 1 origin main
    git checkout -B main origin/main
    skills_tmp="$(mktemp -d "${TMPDIR:-/tmp}/openai-symphony-skills.XXXXXX")"
    trap 'rm -rf "$skills_tmp"' EXIT
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openai/symphony.git "$skills_tmp"
    git -C "$skills_tmp" sparse-checkout set .codex/skills
    mkdir -p .codex/skills
    cp -R "$skills_tmp/.codex/skills/commit" "$skills_tmp/.codex/skills/push" "$skills_tmp/.codex/skills/pull" "$skills_tmp/.codex/skills/land" "$skills_tmp/.codex/skills/linear" .codex/skills/
    SYMPHONY_TRUSTED_HOOK_PHASE=after_create bash ./scripts/symphony/symphony-nvme-package-cache.sh after-create
  before_remove: |
    export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.npm-global/bin:$PATH"
    if [ -f ./scripts/symphony/symphony-nvme-package-cache.sh ]; then
      SYMPHONY_TRUSTED_HOOK_PHASE=before_remove bash ./scripts/symphony/symphony-nvme-package-cache.sh before-remove
    else
      rm -rf ./node_modules ./.symphony/package-cache/pnpm-store
      find ./apps ./packages ./workers -mindepth 2 -maxdepth 2 -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
    fi
agent:
  max_concurrent_agents: 8
  max_turns: 20
codex:
  command: ./scripts/symphony/symphony-codex-router app-server
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

Intake is the Jovie Linear team. States: `Todo` = queued (move to `In Progress` before work); `In Progress` = continue; `Rework` = address review feedback on the existing PR; `Merging` = land the attached PR through the native merge queue. Issues labeled `no-symphony` or `needs-human` are never dispatched. Admission stop-line: the source-owned runtime wrapper holds new dispatch while Summer's closure-health signal in the Gem fleet gate receipt is not healthy (missing or stale receipts hold too), and an issue that hits the bounded ceiling of permanent Linear 4xx errors is dead-lettered to a durable `symphony-issue-dead-letter/v1` receipt and must receive the `no-symphony` label before any further machine pickup.

{% if attempt %}Continuation attempt #{{ attempt }}. Resume; do not redo finished validation.{% endif %}

{{ issue.description }}

Before work: `gbrain search` / `gbrain query`. After: `gbrain put` learnings. No secrets in git. Use official `.codex/skills` only (`commit`, `push`, `pull`, `land`, `linear`) — do not invent a second skill tree. after_create is HTTPS clone only; never SSH. The trusted after_create hook alone may perform the one bounded `pnpm install --offline --frozen-lockfile --ignore-scripts` restore from immutable Gem NVMe into private mutable SATA workspace state before agent start; coding agents must not run package install/fetch commands or create package stores. No mix/elixir hooks on this Jovie workspace.

The app-server command is the repository routing launcher. It verifies the durable `symphony-routing/v1` receipt and launches the selected model instead of a fixed default.

Hyperagent remains one provider behind that router, never a parallel queue. Before `create_thread`, run `scripts/symphony/hyperagent/lifecycle.py preflight` against a fresh sanitized envelope and stop unless it returns `PROCEED`. A returned `threadId` is acceptance only: bind it to the request in `LifecycleJournal`, observe that same thread with bounded backoff, classify structured evidence with `lifecycle.py classify`, and obtain the allowed next step with `lifecycle.py plan`. The pure plan never authorizes direct execution: reserve a mutation atomically with `reserve_action_once`, perform it only when that returns `execute: true`, and record its provider-result digest with `record_action_result`. Never infer an approval from prose. Keep actual approval, ordinary required input, memory approve/reject, sandbox-domain approval, stale status, transport loss, provider failure, and terminal useful outcome distinct. Reconcile the original thread once before any same-key retry; never submit a duplicate job. Resolve an actual approval or required response once only when its exact thread, idempotency key, fingerprint, account, destination, cap, OAuth scope, and existing user authorization match. A web-only approval may use an attended Hyperagent thread; never switch an agent to `Auto`, widen scopes, write memory, purchase credit, enable auto-recharge, or bypass a provider gate merely to unblock. Terminal success requires useful-output, usage/cost, route, and destination receipts; otherwise report `UNKNOWN`.

Unattended git uses git + gh CLI only. Never GitHub MCP, never Codex Apps `create_branch`, never connector `76869538009648d5b282a4bb21c3d157` (meetjovie has `[apps.connector_76869538009648d5b282a4bb21c3d157] enabled=false`).

Work only in this workspace. Smallest correct fix. Never write a Linear token into the repo. Open a non-draft PR; never merge. Keep one `## Codex Workpad` comment.

1. Sync `origin/main` with `git` and create `symphony/{{ issue.identifier }}-fix` with `git checkout -b`.
2. Use official skills plus git + gh CLI to implement, test, commit, push, and open a PR with `Fixes {{ issue.identifier }}`.
3. Move Linear to `In Review` only after the PR URL exists.
