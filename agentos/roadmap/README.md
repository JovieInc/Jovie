# roadmap/

This directory is a structured mirror of Linear's AgentOS initiative. Linear remains the single source of truth for priority, ownership, and status; files here hold execution detail that doesn't belong in Linear (per-project specs, machine-readable briefs, backlog cache).

| File | Purpose |
|------|---------|
| `SYNC_MODEL.md` | Sync protocol spec — how issues move from Linear into this directory. Defined in JOV-1930. |
| `backlog.json` | Machine-readable mirror of active AgentOS issues (schema defined in `SYNC_MODEL.md §3`) |
| `<project-slug>.md` | Per-project spec detail, one file per Linear project under the AgentOS initiative |

<!-- TODO(JOV-1930): SYNC_MODEL.md is being defined in the parallel R1 task. Once that PR lands, update this README to link directly to SYNC_MODEL.md §3 for the backlog.json schema. -->

Sync operations are handled by the `/roadmap` command (JOV-1932).
