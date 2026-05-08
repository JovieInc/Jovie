# memory/

Persistent context that survives across agent sessions. Agents READ these files at session start to orient themselves. Agents do NOT write to these files autonomously — writes require explicit human approval or a defined approval flow (see JOV-1936/D2 for the write-approval protocol).

| File | Purpose |
|------|---------|
| `product-principles.md` | Core product decisions and values that constrain all agent work |
| `design-taste.md` | Visual and UX taste rules derived from human feedback and DESIGN.md |
| `rejected-directions.md` | Directions that have been explicitly ruled out, with rationale |

Agents: read before acting, never write without approval.
