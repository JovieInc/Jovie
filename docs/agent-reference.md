# Fleet Agent Reference

This document provides a reference for the fleet agents used in the JovieInc/Jovie project and the coordination mechanisms that keep them in sync.

## Agents

| Agent | Role | Contact |
|-------|------|---------|
| **Zoe** | Primary coordinator & human-facing operator. Owns the project board, reviews PRs, and delegates work across the fleet. | Zoe's AGENTS.md on Zoe box — see gbrain for the latest |
| **Gem** | CI Cycle-Time Engineer & autonomous shipping agent. Handles CI runners, cron pipeline, and automated PR creation for approved issues. | `AGENTS.md` on gem box (Tailscale 100.105.87.117) |
| **Eve** | Hyperagent / supervisory agent. Monitors fleet health, handles escalation, and reviews automated output. | Hyperagent channel — contact via gbrain |
| **Veronica** | Documentation & knowledge management agent. Maintains canonical docs, specs, and the agent workspace. | Veronica's page in gbrain |

## Coordination

### gbrain (Knowledge Graph)

The fleet uses **gbrain** as its shared coordination ledger. Each agent writes to and reads from gbrain for:

- **Agent job ledger** — Current tasks, completed work, and blockers per agent.
- **Inbox system** — Cross-agent messages (e.g., `inbox/gem-to-zoe/...`, `inbox/zoe-to-gem/...`).
- **Canonical reference** — `AGENTS.md`, `SOUL.md`, `USER.md` per agent, plus project docs.

Access gbrain via the CLI wrapper at `~/.local/bin/gbrain` or through the MCP tools available to each agent.

### Communication Flow

1. **Zoe** triages issues and marks them `tim-approved` / `ready-for-intake`.
2. **Gem** picks up approved issues via the shipping pipeline cron, implements the change, and opens a draft PR.
3. **Gem** writes a gbrain page at `inbox/gem-to-zoe/YYYY-MM-DD-<issue>` summarizing the PR.
4. **Eve** monitors fleet health and reviews automated output.
5. **Veronica** maintains documentation and ensures reference materials stay current.

### Links

- [Gem's AGENTS.md](./AGENTS.md) — Gem's identity and operating instructions (on gem box)
- [Zoe's AGENTS.md](../AGENTS.md) — Zoe's identity and coordination protocols (project root)
- gbrain coordination: `inbox/` namespace in gbrain for cross-agent messages
- Eve Hyperagent: contact via gbrain hyperagent channel

## Onboarding New Agents

When a new agent joins the fleet:

1. Create an `AGENTS.md` in the agent's workspace following the existing format.
2. Add the agent to this reference with role, contact method, and Tailscale IP if applicable.
3. Register the agent's slug in gbrain so the fleet can discover it.
4. Announce in the agent-job-ledger for visibility.