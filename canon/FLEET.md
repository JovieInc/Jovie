# Jovie Fleet Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Owner: Tim White
Last updated: 2026-10-10
Source: founder interviews, 2026-08-17, 2026-09-04 and 2026-10-10

The fleet exists to make Jovie default alive. It does not exist to file issues, keep agents busy, or maximize merges.

Default alive means **MRR covers all-in burn** (infra + AI/fleet + subscriptions + founder draw).

---

## Scoreboard (2026-08-17)

| Input | Value | Source |
|---|---|---|
| Company cash | **$0** (both Mercury accounts) | Tim 2026-08-17. Matches `ops/alive-morning-card-2026-08-13`. |
| MRR | **$0** | Tim: not sellable. Staging Stripe: 0 active, 0 trials. |
| Known paid tool floor | **$935 / mo** | 3× Codex $200 + Kimi $200 + Grok Superheavy $99 + Gmail ~$16 + Linear Basic ~$10 + OpenCode Go $10. Gateway is usage. Claude is dead. Paid from founder survival. |
| Company runway | **0 weeks** | No company cash. |
| Default alive | **no** | MRR $0 and cash $0. |
| Company default-alive date | **not on the calendar** | Requires company cash > 0 and MRR ≥ all-in burn. |
| Founder-funded survival | **private receipt** | Loan, not equity, not company cash. Clock and burn live in ops `finances/default-alive.md`. |

The 2026-08-13 Alive lock stays **fundraise** until company cash > 0, a paid-customer receipt, or a real launch receipt. Web still has to become sellable. **No new paid spend.** HyperAgent and Cloudflare credits were **given, not bought** — use them, do not buy more. Vercel AI Gateway is for cheap DeepSeek etc. Clerk and Claude are gone. The $25k SAFE is spent — not cash. Shipping velocity is not a survival number.

---

## Current bottleneck

A real artist cannot get first value and pay on the **web golden path**.

The delivery enabler in front of that: ready work does not land overnight without Tim. Gem may work the factory only while that is true. Factory SLO (ready PRs land, no Tim) is Gem's scoreboard. It is not the company's.

---

## Org

Organize by **constraint packets**, not skill titles and not standing surface teams. Skills are shared files.

| Role | Job | May page Tim |
|---|---|---|
| Tim | Morning briefing in. 10–60 min video out. Taste, pricing, outbound, irreversible calls. | — |
| Summer | Company governor. One bottleneck. Admit / park / escalate. On demand. | Decision cards only |
| Gem ↔ Symphony | Engineering factory. Drain admitted work. Repair each other. | Only if the factory is down |
| Web walker | Only standing taste/QA role. Dogfoods web signup → first value → pay. | Never. Files to Summer |

Everyone else is burst or personal:

- **Zoe** — personal only. Hard wall. Never Linear.
- **HyperAgent** — spend remaining credits on packets Summer admits. No always-on schedules. No second CoS.
- **Eve / Aria / specialists** — keep if cheap. No heartbeat. Revive only when Summer names the packet they uniquely own.
- **iOS / Mac / content walkers** — burst after a web ship lands there, or after web is sellable.
- **Grok bot** — a channel, not the runtime. Fail over when Grok quota dies. Do not move souls into Grok-only.
- **Ovie** — the ops screen and talk door. Telegram is a fallback channel to the same Ovie Eve identity when Jovie cannot carry the request. Grok can show the same state. It is not a second soul.

Summer owns the company bottleneck. Gem owns the engineering bottleneck. If Symphony is down, Gem fixes it. If Gem is down, Symphony fixes it. Tim is not Gem.

---

## Admission, not filing

Tim may dump every day. **Admission is not filing.**

WIP (dated 2026-08-17, **not current**): the old `1 sellability + 1 factory` static cap is retired. **2026-08-18 lock:** no static WIP. Admit from measured Gem CPU/RAM, CI wait, provider capacity, and lane p95 (`capacity-admission`). Repos are independent.

| Video bucket | Action |
|---|---|
| Hits web sellability or factory-down | Admit. Complete packet: owner, verification, rollback |
| Useful later | Park. Invisible to Gem |
| Research | `/last30days` + X, then park or admit |
| Content | Sanitized → Jovie creator library |
| Personal | Zoe |
| Already in the old teardown pile | Dedup. Not a new issue |

The ~1000 teardown issues are a liability. Gem pulls only from Summer's admitted set. Exhaustive backlog classification already deferred most of them (Aug 9 RCA: 42 eligible, 904 deferred). Eligible is not admitted.

Work admission and production promotion stay separate typed authorities (GREEN / AMBER / RED). Nothing authenticates as Tim to strip `queue-deferred` or jump the merge queue.

---

## Commitment closure

Every accepted repository job must declare its **terminal, destination-bound success check before work begins**, independent of whether it arrives through a WorkOrder, Linear, a CLI command, CI, an agent, or an ad-hoc founder instruction. When feasible, make that check a reproducible CLI command, API/state readback, or deterministic end-to-end test against the intended environment, identity and artifact. Record its expected observable state, freshness/timeout, falsifying outcome, and where its evidence will be returned. For work that cannot have a mechanical oracle (such as a human judgment), require an explicit authenticated decision/result receipt. A test of the **actual promised outcome** is the exit condition; command completion is not.

Keep one durable, destination-bound state receipt throughout execution:

1. **Verified progress (not Done)** — evidence that work materially advanced, with the still-unmet exit check.
2. **Verified outcome (eligible for Done)** — an independently checked, fresh receipt proving the promised result exists at its intended destination.
3. **Current blocker (not Done)** — the exact blocking condition, one accountable owner, and a next action or objective revisit trigger.

An accepted job must remain open while its exit check is **failed, pending, stale or unknown**. An HTTP 200, successful process exit, PR merge, green CI, deployment status, agent assertion or work-order acknowledgment is never by itself proof that a different promised effect happened. A merged documentation change can satisfy a documentation goal; an installed runtime behavior change must be measured on that runtime; a customer-facing change requires the relevant deployed experience/customer-state readback. Do not impose a deployment on tasks whose destination is not production.

The canonical WorkOrder/WorkResult lifecycle ([JOV-7703](https://linear.app/jovie/issue/JOV-7703)) must carry that predeclared predicate and its exact-subject, exact-revision result receipt, and the existing certification/Linear closure consumers must refuse terminal success without a matching passing receipt. On failure/unknown, preserve the current owner and artifacts, perform only bounded authorized retry/repair, re-run the original check, and record the next accountable action. Retest and invalidate/reopen if later evidence contradicts a prior pass. Preserve independent verification and scoped safety gates; do not add a second coordinator or let the verification loop block its own narrow recovery.

Activity, assignment, dispatch, handoff, local completion, and an agent saying “done” are not progress or outcome receipts by themselves. A source change is not a merge; a merge is not a deployment; a deployment is not an exact-runtime or customer outcome.

Before creating work, reconcile existing Linear issues, leases, branches, pull requests, delivery receipts, deployments, and runtime evidence by stable identity. Resume, adopt, close, or explicitly supersede the existing commitment before creating a duplicate.

The primary event path records every material transition. Independent missed-event reconciliation may recover a lost transition, but it may not manufacture progress, ownership, or success. Recovery must remain able to observe and report failure when the component it monitors is unavailable.

Existing enforcement remains authoritative:

| Commitment surface | Existing contract / consumer |
|---|---|
| Linear ownership and terminal issue state | [`.claude/rules/linear.md`](../.claude/rules/linear.md), `.github/workflows/linear-sync-on-merge.yml` |
| PR writer proof and exact-head promotion | `JOV-INV-022`, `scripts/lib/writer-owned-pr-promotion.mjs`, `.github/workflows/merge-queue-autoenroll.yml` |
| PR, CI, queue, deploy, provider, lease, and controller stalls | `JOV-INV-017`, `scripts/backlog-orchestrator/no-unattended-red.mjs`, `.github/workflows/delivery-control-receipts.yml` |
| Canonical fleet state and missed-event repair | `.github/workflows/fleet-gate-refresh.yml` |

No enforcement path may count its own activity as progress or use a handoff receipt as destination proof.

---

## Founder day

**Morning — one briefing on Ovie.** Cash / burn / runway / MRR. Did overnight ships land. Web path pass/fail and the death step. The one admitted packet. At most three decision cards, each with a default-if-silent.

**Then a 10–60 minute video.** Teardown, ideas, objectives. Summer classifies. Sensitive stays blocked.

Tim does not open Linear in the morning. Tim does not enroll PRs.

---

## Anti-goals

- Grow coder concurrency to eat the 1000-issue pile
- Stand up four always-on product walkers
- Migrate the fleet into Grok-only
- Optimize PRs/hour while MRR is $0
- Let Summer stay in shadow while Tim keeps the machine moving

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-10 | Required a predeclared runnable exit check for every repo job; Done needs exact destination proof, not a CLI/HTTP/PR activity receipt. | Tim White |
| 2026-09-21 | Deleted the ownerless-recovery-sweep workflow (chronic infra red on the jovie-fixed runner; ownerless-recovery role folded into the event-driven production controller). | Tim White |
| 2026-09-04 | Made commitment closure explicit: destination-bound proof, accountable blockers, reconcile-before-duplicate, and independent missed-event recovery. | Tim White |
| 2026-08-17 | Created. Constraint-packet fleet. Web-first sellability. Admission ≠ filing. Scoreboard: both accounts $0, $0 MRR; $935/mo known tool floor; gifted credits; $25k SAFE spent. | Tim White |
