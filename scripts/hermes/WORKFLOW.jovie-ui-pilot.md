---
tracker:
  kind: linear
  project_slug: "team:JOV"
  required_labels:
    - symphony
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Canceled
polling:
  interval_ms: 300000
workspace:
  root: /home/timwhite/symphony-workspaces
hooks:
  after_create: |
    set -eu
    git clone --depth 1 https://github.com/JovieInc/Jovie.git .
  before_run: |
    set -eu
    guard="${SYMPHONY_LEASE_GUARD_BIN:-$HOME/.local/bin/symphony-lease-guard}"
    [ ! -x "$guard" ] || "$guard" check "${PWD##*/}"
    if [ ! -d .git ]; then
      find . -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      git clone --depth 1 https://github.com/JovieInc/Jovie.git .
    fi
agent:
  max_concurrent_agents: 40
  max_turns: 24
codex:
  command: ./scripts/hermes/symphony-codex-router app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: dangerFullAccess
    networkAccess: true
server:
  port: 4041
---

Implement `{{ issue.identifier }}` with fresh receipts and useful-turn capacity.
Labels/OAuth are not authority. Own one head; Gem delivers. Preserve gates.
