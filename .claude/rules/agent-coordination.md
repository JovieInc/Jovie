# Agent Coordination — Check Before You Start

Mandatory pre-work check so parallel agents (Claude Code, Codex, Hermes-dispatched,
swarm coders) don't collide on the same area. This codifies the parts of
`gbrain:agent-org-chart` that concretely apply to Jovie coding agents working in
this repo, using mechanisms that already exist here — it does not introduce new
infrastructure. Supplements [`.claude/rules/linear.md`](linear.md) (issue
ownership) and [`.claude/rules/swarm.md`](swarm.md) (claims).

## Mandatory Pre-Work Check

Before editing any file, every agent MUST:

1. **Query gbrain for existing context** — already required by the global agent
   charter §1 ("Brain-First"): `gbrain query "who is working on <topic>"` or the
   `mcp__gbrain__query` tool. Do this before exploring the repo or making
   architectural decisions.
2. **Check this repo's real ownership signals.** There is no separate
   "coordination inbox" here — these existing mechanisms are the inbox:
   - **Linear-tracked work:** is the issue already `In Progress` / assigned? See
     [`.claude/rules/linear.md`](linear.md) → "Linear Ownership Contract." If
     yes, do not start — comment on the issue and pick different work.
   - **Swarm/ruflo-coordinated work:** call `mcp__ruflo__claims_status` /
     `claims_board` before claiming a chunk. See
     [`.claude/rules/swarm.md`](swarm.md) → "Claims."
3. **If another agent already owns the area, do not duplicate the work.** Leave
   a comment (Linear issue or PR) and move to a different task instead of
   racing another agent on the same files.

## GBrain Unreachable: Degrade, Don't Block

If gbrain is unreachable, **gracefully degrade and continue** — explore the
repo/Linear manually, note in the PR/status update that gbrain was unreachable,
and proceed. Do not hard-stop the task.

This is a deliberate divergence from `gbrain:agent-org-chart`, which specifies
"publish a system-blocker alert and stop" on gbrain outage. That page describes
Tim's broader cross-product agent fleet and defaults to blocking. For this repo,
blocking coding agents on a gbrain outage contradicts the tested graceful-
degradation policy in the global agent charter and the 100%-autonomous-shipping
doctrine (`docs/company/autonomous-shipping-doctrine.md`). Reconciling the two
policies is a human architecture decision tracked in JOV-3882 — until that
lands, this repo's coding agents degrade gracefully rather than blocking.

## Scope Note

`gbrain:agent-org-chart` names a cross-product agent roster (Zoe, Maddie,
Veronica, Eve, Main, Summer) and an escalation matrix that span more than this
repo's coding agents. This file only adopts the piece that concretely applies
here — check for existing ownership before starting — via mechanisms that
already exist in this repo (Linear, ruflo claims). It does not adopt the full
roster, escalation matrix, or `#agent-coordination` topic conventions verbatim;
those belong to Hermes-Air / company-wide orchestration, not this repo's
`AGENTS.md`. See [`.claude/rules/hermes-air.md`](hermes-air.md) for the
Hermes-Air/Houston boundary.

The `shared-skills/coordination-basics/SKILL.md` referenced by the same source
does not exist yet in this repo or in gbrain as of this writing — do not assume
it exists. Creating it (and deciding which repo should own it) is tracked in
JOV-3883.
