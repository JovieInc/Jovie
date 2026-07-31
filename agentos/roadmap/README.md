# roadmap/

This directory is a structured mirror of Linear's AgentOS initiative. Linear remains the single source of truth for priority, ownership, and status; files here hold execution detail that doesn't belong in Linear (per-project specs, machine-readable briefs, backlog cache).

| File | Purpose |
|------|---------|
| `SYNC_MODEL.md` | Sync protocol spec — how issues move from Linear into this directory (JOV-1930). |
| `backlog.types.ts` | TypeScript shape for `backlog.json` (SYNC_MODEL §3; JOV-1932). |
| `backlog.json` | Machine-readable mirror of active AgentOS issues (schema: `backlog.types.ts` / `SYNC_MODEL.md` §3). Do not hand-edit. |
| `<project-slug>.md` | Per-project spec detail, one file per Linear project under the AgentOS initiative |

## Sync + ops

```bash
pnpm roadmap sync              # regenerate backlog.json from Linear
pnpm roadmap sync --check      # exit 1 if mirror drifts
pnpm roadmap today --json      # active issues (Todo / In Progress / In Review)
pnpm roadmap approved --json   # agent-owned, human-review gate cleared
pnpm roadmap agent-brief JOV-N # structured agent brief
pnpm roadmap add "Title" --dry-run
pnpm roadmap expand JOV-N --dry-run
```

Skill: `.claude/skills/roadmap/SKILL.md` · CLI: `scripts/roadmap/roadmap.mjs` · Tests: `pnpm roadmap:test`
