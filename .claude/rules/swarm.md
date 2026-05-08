# Ruflo-Coordinated Swarm Pattern

Canonical reference for lead-orchestrated parallel agent swarms using ruflo MCP + pre-created Git worktrees. Read this before spawning multi-agent work without Linear issues.

**Related:** The `/swarm` gstack skill handles Linear-driven swarms. This file documents the ad-hoc ruflo-coordinated pattern for multi-chunk work that does not require Linear issues — see `.claude/rules/gstack.md` for the cross-reference.

## When to Use

Use this pattern when you need to parallelize large mechanical work across multiple independent chunks:

- Parallel design-system migrations (token sweeps, component consolidation, surface-elevation fixes)
- Large mechanical refactors where chunks are disjoint by file path
- Multi-chunk audits where each chunk produces its own PR
- Any work where 3 or more independent changes can land without ordering dependencies

Do NOT use this pattern for:
- Work with strong ordering dependencies (use sequential PRs instead)
- Changes touching shared infrastructure (middleware, DB schema, env, billing)
- Any chunk whose HOT ZONE overlaps with a sibling agent's HOT ZONE

## Roles

| Role | Profile | Does |
|------|---------|------|
| Lead / Orchestrator | `code-orchestrator` or human | Plans chunks, creates worktrees sequentially, dispatches coder agents, monitors progress, reviews PRs. Never edits product code. |
| Coder Agent | `coder` | Executes exactly one assigned chunk from worktree setup through merged PR. Stays inside its HOT ZONE. |
| Plan Subagent | Opus (spawned by lead) | Taste decisions, architecture questions, ambiguous design calls. Consulted by coder agents; does not implement. |

The lead never edits files. If the lead discovers product work, it creates a manifest and dispatches a coder. See `CLAUDE.md` under "Agent Role Boundary".

## Coordination Layer (ruflo MCP)

ruflo MCP tools provide the shared state layer across agents. The lead initializes swarm state; coder agents read and write it.

### Swarm init (lead)

```
mcp__ruflo__swarm_init({ id: "ds-wave-N", goal: "...", maxAgents: 6 })
```

Establishes a named swarm session. All agents reference the same `id`.

### Memory (lead seeds, coders read)

```
mcp__ruflo__memory_store({
  key: "canonical-tokens",
  content: "...",         // token naming rules, surface elevation rules, etc.
  namespace: "swarm/ds-wave-N"
})
```

Three canonical stores the lead always seeds before dispatch:
- `canonical-tokens` — design token naming rules and migration map
- `ui-rules-digest` — condensed taste rules from `.claude/rules/ui.md` relevant to this wave
- `ship-recipe` — the per-chunk verification + ship sequence (typecheck, biome, vitest, push, draft PR, /qa --exhaustive, /ship, auto-merge)

Coder agents retrieve these at session start:
```
mcp__ruflo__memory_search({ query: "canonical-tokens", namespace: "swarm/ds-wave-N" })
```

### Claims (collision-free dispatch)

Claims prevent two agents from working the same chunk. The lead registers chunks; coder agents claim before starting work.

```
# Lead registers chunks
mcp__ruflo__claims_claim({ id: "chunk-earnings-page", owner: "lead", swarmId: "ds-wave-N" })

# Coder claims its chunk
mcp__ruflo__claims_claim({ id: "chunk-earnings-page", owner: "agent-slug", swarmId: "ds-wave-N" })

# Coder checks before starting
mcp__ruflo__claims_status({ id: "chunk-earnings-page", swarmId: "ds-wave-N" })

# Coder releases after PR merges
mcp__ruflo__claims_release({ id: "chunk-earnings-page", swarmId: "ds-wave-N" })
```

Before starting any chunk, always call `claims_status`. If another agent has claimed it, pick a different chunk from the board:
```
mcp__ruflo__claims_board({ swarmId: "ds-wave-N" })
```

### Progress (live status)

```
mcp__ruflo__progress_summary({ swarmId: "ds-wave-N" })
```

Coders call `progress_check` after each major step (discovery, implement, tests pass, PR merged). The lead monitors `progress_summary` to know when to dispatch the next wave.

### Cross-swarm learning

```
mcp__ruflo__agentdb_pattern-store({
  pattern: "surface-elevation-fix",
  example: "...",
  outcome: "success",
  tags: ["design-system", "wave-1"]
})
```

Coders store patterns after a successful ship. Future waves retrieve them:
```
mcp__ruflo__agentdb_pattern-search({ tags: ["design-system"] })
```

## Execution Layer (Claude Code Agent Tool)

The lead spawns coder agents using the Agent tool. Always use pre-created worktrees, not `isolation: "worktree"` — see the critical note below.

```
Agent({
  subagent_type: "general-purpose",
  model: "claude-sonnet-4-6",          // sonnet for cost efficiency on mechanical work
  mode: "bypassPermissions",
  run_in_background: true,
  name: "<chunk-slug>",
  prompt: `
    JOVIE_AGENT_PROFILE=coder
    Worktree: /private/tmp/jovie-worktrees/<chunk-slug>
    Branch: tim/<chunk-slug>
    HOT ZONE: <list of files/dirs this agent owns>
    Chunk: <what to do>
    Follow .claude/rules/swarm.md per-chunk ship recipe exactly.
    Retrieve canonical-tokens and ui-rules-digest from ruflo namespace swarm/<swarm-id>.
  `
})
```

## Why Pre-Created Worktrees, Not `isolation: "worktree"`

Do not use `isolation: "worktree"` when spawning swarm agents.

`isolation: "worktree"` sandboxes the spawned agent in a way that strips Bash tool permissions and MCP tool access, including `mcp__ruflo__*`. This was verified as a failure mode on 2026-05-07: agents spawned with this mode could not run shell commands or reach ruflo coordination tools, making them unable to follow the ship recipe.

The correct pattern is for the lead to pre-create worktrees sequentially before spawning agents, then pass the worktree path explicitly in the agent prompt:

```bash
# Lead creates worktrees SEQUENTIALLY (never in parallel -- they race on branch config)
git worktree add /private/tmp/jovie-worktrees/chunk-a -b tim/chunk-a origin/main
git worktree add /private/tmp/jovie-worktrees/chunk-b -b tim/chunk-b origin/main
git worktree add /private/tmp/jovie-worktrees/chunk-c -b tim/chunk-c origin/main
# ... then spawn all agents in parallel
```

Worktrees share the Turbo cache automatically (Turbo 2.8+). No configuration needed.

## Required Permissions for Coder Agents

Agents spawned with `mode: "bypassPermissions"` inherit the session permission allowlist. The lead session must have the swarm allowlist active or agents will hit permission walls.

Merge `.claude/settings.swarm.example.json` into `.claude/settings.local.json` before launching a swarm. See that file for the exact allowlist and instructions.

Verify setup with:
```bash
./scripts/setup-swarm.sh
```

## Per-Chunk Ship Recipe

Every coder agent follows this sequence exactly. No shortcuts.

```bash
# 1. Bootstrap (every agent, every time)
cd /private/tmp/jovie-worktrees/<chunk-slug>
export JOVIE_AGENT_PROFILE=coder
./scripts/setup.sh
pnpm install --frozen-lockfile

# Drop stale lint-staged backup stashes (prevents pre-commit hook false failures)
git stash list | grep "lint-staged automatic backup" | cut -d: -f1 | xargs -r -n1 git stash drop || true

git status  # confirm clean

# 2. Discovery
# Grep for the pattern this chunk targets, scoped to HOT ZONE only
# Optionally spawn an Opus Plan subagent for taste decisions

# 3. Implement
# Edit only files in the assigned HOT ZONE

# 4. Verify
pnpm --filter @jovie/web run typecheck -- --pretty false
pnpm biome check --write <edited files>
pnpm --filter web exec vitest run <affected test file>   # if applicable

# 5. Push + draft PR
git add <files>
git commit -m "fix(design-system): <conventional commit message>"
git push -u origin tim/<chunk-slug>
gh pr create --draft --base main --title "fix(design-system): <title>" --body "<body>"

# 6. QA (REQUIRED -- flag is mandatory)
# Invoke /qa --exhaustive
# Address any blockers before proceeding

# 7. Ship
# Invoke /ship
# /ship detects the draft PR, promotes it, runs typecheck + lint + tests

# 8. Auto-merge
PR_NUM=$(gh pr view --json number --jq '.number')
gh pr merge --auto --squash $PR_NUM

# 9. Release claim
mcp__ruflo__claims_release({ id: "<chunk-slug>", swarmId: "<swarm-id>" })
```

## Banned Patterns

| Banned | Why |
|--------|-----|
| `git commit --no-verify` | Bypasses hooks. Never. Fix the hook failure instead. |
| `git stash` without dropping lint-staged backup stashes first | Causes stash races across worktrees; symptom is "lint-staged automatic backup is missing" |
| `git worktree add` in parallel | Races on upstream branch config; always sequential in the lead |
| Agent editing files outside its HOT ZONE | Creates merge conflicts and makes reviews impossible; each agent owns its declared files |
| Skipping `/qa --exhaustive` | The `--exhaustive` flag is required; `/qa` alone runs a shorter path that misses regression coverage |
| `isolation: "worktree"` in Agent tool | Strips Bash + MCP permissions; use pre-created worktrees instead |
| Parallel `git commit` across worktrees | Stash races; lead must serialize commit windows or use separate push windows |

## Reference Implementation

The seed plan that established this pattern lives at:
```
.claude/plans/system-instruction-you-are-working-spicy-wave.md
```

This file is gitignored (it is a session-specific plan artifact, not a committed doc). If you need to reconstruct a wave plan, use `/autoplan` and reference this rules file as the coordination contract.
