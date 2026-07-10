# Agent Reference

Quick-reference for agents entering the Jovie fleet.

## Fleet topology

| Agent | Role | Contact |
|-------|------|---------|
| **Gem** 💎 | CI cycle-time engineer & pre-scoped shipper | Own AGENTS.md on `gem` box (see [AGENTS.md](../AGENTS.md)) |
| **Zoe** 🧑‍💼 | Human overseer, fleet coordination | Zoe's AGENTS.md (internal fleet docs) |
| **Eve** 🤖 | Hyperagent — swarm orchestration & agent dispatching | Reachable through gbrain coordination channels |

## gbrain coordination

All agents coordinate through **gbrain** — the central agent-job-ledger and message bus.

- **Agent-job-ledger:** gbrain tracks every agent's active job, status, and output artifacts. Use gbrain's inbox/outbox system for cross-agent messages.
- **MCP API:** gbrain exposes an MCP server over HTTP SSE on port `:7801` — see [`docs/reference/gbrain-mcp-api.md`](reference/gbrain-mcp-api.md) for details.
- **Org chart:** Before starting work, query `gbrain:agent-org-chart` to learn current ownership and avoid overlap.

## Related documents

- [`AGENTS.md`](../AGENTS.md) — Agent Operating Manual (controller map)
- [`docs/AI_AGENT_GUIDE.md`](AI_AGENT_GUIDE.md) — AI Agent Developer Guide (codebase quick-ref)
- [`docs/reference/gbrain-mcp-api.md`](reference/gbrain-mcp-api.md) — gbrain MCP API reference