# Agent Reference

Quick reference for discovering Jovie's agent fleet topology. New agents should
read this before starting work so they can locate the right coordination
surface and the right people to delegate to.

## Coordination

- **gbrain agent job ledger** — `coordination/agent-job-ledger`. The
  system-of-record for which agent owns which area and what work is in flight.
  Read it before starting any task, and update it when you claim or hand off
  work. See `scripts/agent/PREFLIGHT.md` for the preflight contract.

## Fleet

- **Gem** — Gem's operating manual lives in `AGENTS.md` on the gem box. Read it
  for Gem's role, boundaries, and shipping pipeline.
- **Zoe** (OpenClaw) — Communications & intelligence, outer-loop orchestration.
  Zoe's operating manual is in `AGENTS.md` (OpenClaw).
- **Eve** (HyperAgent) — Planner / PM. Specs issues and routes work to build
  models. Contact Eve through the HyperAgent control plane for planning and
  routing help.