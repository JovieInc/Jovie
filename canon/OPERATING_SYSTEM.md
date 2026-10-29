# Jovie Operating System

Version: 1.2
Status: Constitution (highest authority)
Owner: Tim White
Last updated: 2026-10-20

This document is the highest-level operating philosophy for Jovie.

Every human, AI agent, automation, workflow, skill, and product decision follows these principles.

**If another document conflicts with this one, this document wins.**

The domain canon files under `/canon` (`PRODUCT.md`, `ENGINEERING.md`, `DESIGN.md`, `MARKETING.md`, `VOICE.md`) inherit from this constitution and specialize it. Operational detail lives in `docs/`, `.claude/rules/*`, and skills. When operational detail conflicts with a canon file, canon wins; when a canon file conflicts with this constitution, the constitution wins.

---

## Mission

Maximize long-term customer value by repeatedly eliminating the system's current bottleneck.

We optimize throughput.

We do not optimize components.

---

## Core Loop

Forever:

1. Identify the bottleneck.
2. Gather evidence.
3. Remove the bottleneck.
4. Measure the outcome.
5. Repeat.

Every improvement should increase overall system throughput.

---

## The Ten Laws

### Law 1 — Optimize the bottleneck

Never optimize something that is not currently limiting the business.

### Law 2 — Measure before optimizing

Every proposal answers:

- What is the bottleneck?
- What evidence proves it?
- Which metric improves?
- How will we verify success?

If these cannot be answered, keep gathering evidence.

**Hard rule: unmeasured is unfinished.** Everything that can be measured and
verified must be. A new pipeline, loop, lane, controller or feature is done only
when each stage it adds is registered in `docs/metrics/stage-manifest.json`,
emits timestamped `jovie-stage-event/v1` rows (or is derived from durable
receipts), and reports p50/p95/n in the stage-timings snapshot. Those p95s are
metrics to drive down. Contract: [`docs/metrics/STAGE_EVENTS.md`](../docs/metrics/STAGE_EVENTS.md).

### Law 3 — Prefer boring technology

New technology is adopted only if it removes today's bottleneck. Never because it is newer, more elegant, or more interesting.

Default choices:

- PostgreSQL
- TypeScript
- Next.js
- Supabase
- Upstash
- Stripe

These remain until they become the bottleneck.

### Law 4 — Optimize globally

Local improvements that do not improve overall throughput are waste.

| Bad (local) | Good (global) |
|---|---|
| Faster Redis | Merge time reduced 45m → 12m |
| Better CSS animation | Activation increased 24% → 41% |
| New ORM | Trial conversion increased 8% → 13% |

### Law 5 — Prefer reversible decisions

Choose the option that preserves future optionality. Expensive migrations require measurable justification.

### Law 6 — Small iterations beat perfect plans

Ship. Measure. Adjust. Repeat.

### Law 7 — The customer is the source of truth

Opinions are weak evidence. Metrics are stronger. Observed customer behavior is strongest.

### Law 8 — Every optimization has an opportunity cost

Time spent improving one system cannot improve another. Always ask: *"What bottleneck are we choosing NOT to solve?"*

### Law 9 — Delete aggressively

Complexity compounds forever. Code. Infrastructure. Meetings. Documentation. Features. Agents. Delete whenever possible.

### Law 10 — AI exists to increase throughput

Agents should eliminate work, never create work for humans. Every automation should remove future effort.

---

## The One Question

Every agent — human or AI — constantly asks itself:

> **What is the highest-leverage thing I can do in the next 30 minutes to increase company throughput?**

Not "What can I improve?"
Not "What should I refactor?"
Not "What's technically coolest?"

That single question naturally prioritizes work like:

- Fixing a CI queue blocking 20 PRs.
- Repairing onboarding that's cutting activation in half.
- Shipping an artist profile feature that unlocks revenue.

And naturally deprioritizes:

- Swapping databases because a new one is fashionable.
- Refactoring stable code with no measurable user benefit.
- Saving milliseconds on requests when AI calls take seconds.

Over thousands of agent-hours, this becomes a coherent operating system rather than a collection of isolated automations.

### Default priority (EVENT 2026-10-28, Tim)

Pre-launch, working and shipped beats polished and stalled. Apply without being told:

1. **Most effort goes to the current constraint:** the blocker to shipping (red queue, stale production, failing release gate) or the biggest drop in activation (landing → signup → claim → checkout → paid). Everything else is secondary.
2. **Rank surfaces by importance and traffic.** The golden path and the highest-traffic pages come first; low-traffic surfaces wait.
3. **Quality gates never stall shipping.** When a quality-only gate (perf/LCP budget, layout shift or geometry, visual polish) blocks the queue or a release, set it to the measured baseline or report-only, add a `ratchet: JOV-xxxx` marker plus an issue to tighten it, ship, then fix. A green golden path today beats a fast one next week.
4. **Correctness gates still block:** signup, auth and billing actually working; security; secrets; data integrity.
5. **Process is a cost.** A CI job, check, controller or gate that doesn't catch real defects gets deleted. A slow or polling one gets refactored to run fast and on events. Deleting is preferred to adding.

### Nothing waits on a human (EVENT 2026-10-28, Tim)

> "There shouldn't be any reason that anything gets held by a human. Holds for humans are only for taste gates, and even then they should still ship behind a flag, with any modifications going in a follow-up. Waiting for anything on a human is too slow." "I should have one place to approve and certify things, and that's Ovie: one inbox I can swipe on."

1. **No human hold exists.** `tim-hold`, `tim:hold`, `hold:tim`, `do-not-merge`, `needs-human`, `needs-human-decision`, `human-review-required` and `no-auto` are retired. They block no admission, repair, merge or queue path, and the Legacy Human Hold Scrub deletes any that is applied. The remaining stop labels (`hold`, `gated`, `incident`, `queue-deferred`) are machine holds: a receipt names an owner and a machine-checkable release (`jovie-hold/v1`).
2. **Taste ships behind a flag** (or the default ships). Tim's feedback is a follow-up PR that arrives through one Ovie inbox card (swipe or tap), never a wait before landing.
3. **Reserved decisions** (new spend, credentials, legal, outbound to real people, live price changes) become one non-blocking Ovie card with a default and a deadline (`docs/operations/DECISION_DEFAULT_CONTRACT.md`). The change ships disabled behind its flag; the card never blocks unrelated work. Spend and outbound defaults are "no action".
4. **Machines stay fully blocking:** CI, Migration Guard, security and secret scans, boundary tests, correctness and an LLM review gate. Review is a machine gate, not a label or a CODEOWNERS approval from a person.
5. **Lanes park nothing for a human.** A remediation `needs-human-decision` is a `decisionAsk` row (`escalation.json`, `jovie.lanes-decision-ask/v1`) with `blocking: false`, a default and a `decideBy`; the PR continues through the ordinary machine ladder.

---

## Decision Framework

Every proposal starts here.

### Problem

- Current bottleneck:
- Evidence:
- Impact:

### Proposal

- How does this remove the bottleneck?
- Expected metric improvement:
- Risk:
- Rollback:
- Measurement plan:

---

## Company Bottlenecks

The company always has exactly one primary bottleneck. Typical order — **never skip ahead**:

1. Product-market fit
2. Distribution
3. Activation
4. Retention
5. Revenue
6. Hiring
7. Engineering throughput
8. Infrastructure
9. Micro-optimizations

## Capital Strategy Is Phase-Dependent

Capital is an input to the system, not a ritual or a referendum on the founder.

When runway is the primary bottleneck, optimize for **clean runway added per founder-hour**. Do not apply post-product-market-fit investor selectivity to a company whose survival depends on reaching product-market fit.

| Company phase | Capital policy |
|---|---|
| **Pre-PMF or runway-constrained** | Capital is survival. Give credible check-writing intent a fast path. Investors do not need to be customers or personally experience the problem. If a SAFE is clean and favorable after dilution, rights, compliance, and counterparty review, take the money and keep building. |
| **Post-PMF, not default-alive** | Capital is acceleration. Raise against a measured bottleneck and require a credible mechanism from capital to increased throughput. Weight investor quality and strategic fit more heavily. |
| **Default-alive or capital-optional** | Capital is leverage. The company can demand stronger alignment, customer understanding, and partnership quality because declining a check does not threaten the learning loop. |

If phase signals conflict, the more survival-oriented phase governs. Claimed PMF never outranks a real runway constraint.

Investor calls are allowed whenever they have a credible path to capital. We eliminate fundraising theater, not access to money: use one reusable memo, demo, data room, and decision-focused process; automate qualification and follow-up; reserve bespoke work and repeated meetings for investors with demonstrated ability and intent to close.

Investor confusion is not customer evidence. Never pivot toward a market merely because its investors are easier to talk to, and never reject useful capital merely because an investor does not live the customer's problem.

The operational contract, qualification gate, and metrics live in the private `JovieInc/Ops` repo at `jovie-private/docs/company/CAPITAL-STRATEGY.md` (see [strategy canon](./strategy/README.md) for how to read it).

---

## Engineering Optimization Order

Optimize in this order; never reverse without evidence:

1. Correctness
2. Developer velocity
3. Reliability
4. Cost
5. Latency
6. Elegance

---

## Product

Optimize **customer value delivered per week** — not features shipped.

---

## AI Agents

Agents think like this:

1. Observe.
2. Measure.
3. Identify constraint.
4. Recommend smallest change.
5. Measure again.

Agents resist speculative optimization.

---

## Definition of Success

Success is increasing company throughput. Everything else is secondary.

---

## Relationship to Existing Canon

This constitution sits **above** the four operating principles in [`../docs/company/operating-principles.md`](../docs/company/operating-principles.md) and the fleet contract in [`FLEET.md`](./FLEET.md). Those principles (Ship Fast, Run Experiments, Document Everything, MRR Is King) remain valid and are the operational mechanism for this constitution:

- **MRR Is King** is how we measure throughput in dollars — the customer paying is the strongest signal (Law 7). Default alive is MRR ≥ all-in burn ([`FLEET.md`](./FLEET.md)).
- **Ship Fast, Iterate** is Law 6 in practice.
- **Run Experiments When in Doubt** is Law 2 in practice.
- **Document Everything** is how the closed loop keeps compounding (Laws 1–2 depend on durable evidence).
- **Fleet** is how one human steers: Summer admits, Gem drains, Tim does not babysit the queue.

When operating-principles or a `.claude/rules/*` file gives concrete implementation, follow it. When it is silent or in tension, resolve upward to this document.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-20 | Law 2 hard rule: new pipelines and features must emit stage timestamps and a metric to be done. | Tim White |
| 2026-08-17 | Point at `FLEET.md` as the closed-loop / default-alive operating contract. | Tim White interview |
| 2026-08-13 | Added phase-dependent capital policy: survival before selectivity, fast-path clean SAFEs, and no investor-theater requirement. | Tim White |
| 2026-07-17 | Created `/canon/OPERATING_SYSTEM.md` as company constitution (Theory of Constraints operating model). | Tim White |
