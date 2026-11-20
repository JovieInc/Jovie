# Summer Cursor Projects policy

Status: **policy locked** (accelerate or improve; never tax either)

Owner: Summer (company governor). Factory drain remains Symphony → Gem.
Source: Tim direction 2026-11-20 — use Cursor Projects only when they
genuinely accelerate output and/or raise quality, never at the expense of
either.

Product reference: [Cursor Projects](https://cursor.com/docs/agent/projects).

## Decision

Symphony → Gem is the default engineering drain. Cursor Projects are an
optional accelerator Summer may open or recommend only when a durable
multi-agent workspace clearly beats a normal Gem pull.

- Not an alternate lane that routes ordinary admitted tickets away from Gem.
- Not auto-create-every-initiative behavior.
- Not a second company CoS or a bypass of admission, review, or merge authority.

Projects add coordinator + shared store + parallelism overhead. That pays off
for multi-PR / multi-day / shared-context work. For one-shot tickets it slows
output and dilutes quality ownership.

## What a Cursor Project is (for Summer)

A long-lived cloud workspace with:

- a coordinator that plans and delegates (does not write product code itself)
- parallel workers for investigations, PRs, audits, write-ups
- a shared Project store (`preferences.md`, `notes.md`, `workflows/`,
  `principles/`) that survives agents and context resets
- optional subscriptions (Slack, schedule, PR/CI) and multiplayer task board

Best for work that outlives one chat. Distinct from Gem-dark Cursor Cloud
isolated recovery (`cursor-recovery` lane), which is diagnostics / PR prep
only when Gem is dark.

## Usage gate

Open or recommend a Project only when **all** YES checks pass. Any NO blocks.

### YES (all required)

1. Work is already admitted, or Tim explicitly ordered a Project-shaped packet.
   Projects never bypass Summer admission.
2. Body of work outlives one PR / one Gem lease: multi-PR feature, migration,
   overnight cook, recurring watch, or cross-repo coordination.
3. Shared durable context will raise quality (standing prefs, workflows,
   principles, notes tracker) more than pasting the same kickoff into serial
   agents.
4. Parallel workers will accelerate wall-clock versus one Gem worker
   (independent workstreams, not a forced serial chain).
5. Done-bar is predeclared (destination-bound success check per
   [`canon/FLEET.md`](../../canon/FLEET.md) commitment closure).
6. Spend/capacity is acceptable under current fleet posture (no new paid spend;
   HyperAgent / credits rules still apply).

### NO (any blocks)

- Single Linear ticket that one Gem worker can finish.
- Triage, admission, park, or founder decision-card work (stays on Ovie/Linear).
- Gem is healthy and the packet is ordinary factory drain.
- Project would skip review / gauntlet, merge authority, or production receipts.
- Creating a Project per ticket or per heartbeat (coordination tax).
- Uncertain ownership, personal/mixed scope, or Gem-dark live-service mutation
  (keep existing isolated recovery rules).

## Quality and speed non-negotiables inside a Project

- Speed without the PR / outcome gauntlet is a fail.
- Quality theater (extra coordinators, status noise, duplicate Linear + Project
  trackers with no parallel win) is a fail.
- Summer still owns admission and closure health.
- Gem still owns queue / release mechanics for factory PRs unless Tim reassigns.
- Never merge or deploy from Project workers; Tim / merge-queue authority
  unchanged.

## Fixtures

| Case | Packet | Gate | Route |
| --- | --- | --- | --- |
| a | Single JOV bug, one PR | NO (one Gem lease) | Symphony → Gem |
| b | Multi-PR migration with shared test playbook | YES | Cursor Project accelerator |
| c | Gem dark, need diagnostics / PR prep | NO (recovery lane) | Existing Cursor Cloud recovery, not a Project |
| d | Tim video triage dump | NO (admission work) | Ovie / Linear; no Project |

## Seeding a Project (when the gate passes)

Keep kickoffs short: goal, constraints, done-bar. Point workers at store files
instead of pasting long procedures.

Suggested store layout:

- `preferences.md` — standing prefs, one line per rule
- `notes.md` — For Review / In Progress / Queued / Done / Canceled
- `workflows/` — repeatable procedures (PR ship, overnight cook)
- `principles/` — short non-negotiables (no external writes, no merge)

Link the Project from the admitted Linear packet. Do not invent a second
source of truth for admission or Done.

## Non-goals (this policy)

- Cloud Agents Projects API auto-create / dispatch wiring
- Replacing Symphony → Gem for normal drain
- Changes to Vercel `project-creation-policy` (unrelated platform projects)
- New paid Cursor spend

Any later automation must cite this gate and stay reject-by-default.

## Related

- Fleet org and admission: [`canon/FLEET.md`](../../canon/FLEET.md)
- Summer identity (recovery mirror):
  [`apps/eve-pilot/identities/summer/instructions.md`](../../apps/eve-pilot/identities/summer/instructions.md)
- Gem-dark Cursor Cloud recovery:
  [`apps/eve-pilot/agent/lib/cursor-recovery.ts`](../../apps/eve-pilot/agent/lib/cursor-recovery.ts)
- Live Summer soul: `JovieInc/summer-config` `apps/summer/identities/summer/instructions.md`
