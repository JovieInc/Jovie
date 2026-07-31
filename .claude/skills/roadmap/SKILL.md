---
name: roadmap
description: |
  Linear AgentOS roadmap ops. Use when creating issues from briefs, expanding
  epics into sub-issues, syncing Linear into agentos/roadmap/backlog.json,
  listing today's active work, listing human-approval-cleared issues, or
  emitting a structured agent-brief for a Linear issue. Invoked as /roadmap.
version: 2026-07-31
scope: JovieInc/Jovie
---

# /roadmap

CLI + skill wrapper around Linear GraphQL for AgentOS roadmap operations.
Linear remains the source of truth; `agentos/roadmap/backlog.json` is a
regenerated mirror (see `agentos/roadmap/SYNC_MODEL.md`).

## Invocation

```bash
pnpm roadmap <command> [args] [flags]
# or
node scripts/roadmap/roadmap.mjs <command> [args] [flags]
```

Requires `LINEAR_API_KEY` for network commands (`add`, `expand`, `sync`, live
`agent-brief`). Prefer Doppler:

```bash
doppler run --project jovie-web --config dev -- pnpm roadmap <command> ...
```

## Subcommands

| Command | Purpose |
|---|---|
| `add <title>` | Create a Linear issue from a brief (always labels `agentos`) |
| `expand <issueId>` | Generate sub-issues from epic description bullets or `--from` file |
| `sync` | Pull Linear state into `agentos/roadmap/backlog.json` |
| `today` | List/emit today's active issues (Todo / In Progress / In Review) |
| `approved` | List agent-owned issues with `human-review-required` cleared |
| `agent-brief <issueId>` | Emit structured agent brief JSON for an issue |

### Examples

```bash
# Create
pnpm roadmap add "Define sync cadence" --description "..." --priority 2 --dry-run

# Expand epic from its acceptance-criteria bullets
pnpm roadmap expand JOV-1900 --dry-run
pnpm roadmap expand JOV-1900 --from /tmp/subissues.txt

# Sync mirror (write) / drift check (read-only)
pnpm roadmap sync --force
pnpm roadmap sync --check

# Today's work + approved agent issues
pnpm roadmap today --json
pnpm roadmap approved --json

# Structured brief for an agent run
pnpm roadmap agent-brief JOV-1932
```

### Flags

- `--dry-run` — plan writes without Linear mutations (`add`, `expand`)
- `--check` / `--force` / `--out <path>` — `sync` modes
- `--json` — machine-readable output (default for most commands)
- `--from <file>` — title list for `expand`
- `--description`, `--project`, `--priority`, `--parent`, `--labels` — `add`
- `--limit <n>` — cap list size
- `--backlog <path>` — override backlog.json path for offline commands

## Contract

- Schema: `agentos/roadmap/backlog.types.ts` + `SYNC_MODEL.md` §3
- Agent ownership: label `agentos` + no `human-review-required` (+ delegate when JOV-1934 provisions AgentOS app user)
- Drift: Linear always wins; `sync --check` exits non-zero on tracked field drift
- Brief schemaVersion `1` aligns with JOV-1933; this skill emits a usable brief now

## Tests

```bash
pnpm roadmap:test
```

Each subcommand module is unit-tested in isolation under `scripts/roadmap/__tests__/`.
