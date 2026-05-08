# AgentOS

AgentOS is the private orchestration surface for Jovie. Linear is the canonical roadmap and source of truth for product work and ownership. This directory mirrors execution detail — specs, persistent agent memory, run artifacts, and role definitions — that belongs in the repo but not in Linear.

| Directory | Purpose |
|-----------|---------|
| `roadmap/` | Linear AgentOS issue mirror, per-project specs, and backlog machine-read cache |
| `memory/` | Persistent context that survives across agent sessions (product principles, design taste, rejected directions) |
| `agents/` | Per-agent role definition files for AgentOS-specific agent types |
| `runs/` | Agent run output artifacts (screenshots, diffs, generated proposals) |

## References

- Phase 0 ADR: [`docs/AGENT_OS_ARCHITECTURE.md`](../docs/AGENT_OS_ARCHITECTURE.md)
- Phase 1 run schema: [`apps/web/lib/agent-os/artifact.ts`](../apps/web/lib/agent-os/artifact.ts) _(introduced in the AgentRunArtifact PR)_
- Linear initiative: [AgentOS](https://linear.app/jovie/initiative/agentos-1838d0d6b914)
