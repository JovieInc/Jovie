# Jovie Operating System

Version 1.3 · Constitution (highest authority) · Owner: Tim White · Updated 2026-10-29

Every human, agent, automation, workflow, skill and product decision follows
this. **If another document conflicts with this one, this one wins.** Domain
canon (`canon/PRODUCT.md`, `ENGINEERING.md`, `DESIGN.md`, `MARKETING.md`,
`VOICE.md`) specializes it; operational detail lives in `docs/`,
`.claude/rules/*` and skills. Detail beats silence, canon beats detail, this
beats canon. Templates, the bottleneck order, capital policy, lineage and
changelog: [OPERATING_SYSTEM_REFERENCE.md](OPERATING_SYSTEM_REFERENCE.md).

## Mission and loop

Maximize long-term customer value by repeatedly eliminating the system's
current bottleneck. Optimize throughput, not components. Forever: identify the
bottleneck, gather evidence, remove it, measure the outcome, repeat.

## The Ten Laws

1. **Optimize the bottleneck.** Never optimize what is not limiting the business.
2. **Measure before optimizing.** Answer: what is the bottleneck, what evidence
   proves it, which metric improves, how will we verify? If you can't, keep
   gathering evidence. **Unmeasured is unfinished:** a new pipeline, loop,
   lane, controller or feature is done only when each stage it adds is in
   `docs/metrics/stage-manifest.json`, emits timestamped `jovie-stage-event/v1`
   rows (or derives them from durable receipts) and reports p50/p95/n in the
   stage-timings snapshot ([contract](../docs/metrics/STAGE_EVENTS.md)). Drive the p95s down.
3. **Prefer boring technology.** Adopt new tech only to remove today's
   bottleneck. Defaults until they become the bottleneck: PostgreSQL,
   TypeScript, Next.js, Supabase, Upstash, Stripe.
4. **Optimize globally.** Local wins that don't move company throughput
   (merge time, activation, conversion) are waste.
5. **Prefer reversible decisions.** Expensive migrations need measured justification.
6. **Small iterations beat perfect plans.** Ship, measure, adjust.
7. **The customer is the source of truth.** Opinions < metrics < observed customer behavior.
8. **Every optimization has an opportunity cost.** Ask which bottleneck you are choosing not to solve.
9. **Delete aggressively.** Code, infrastructure, meetings, docs, features, agents.
10. **AI exists to increase throughput.** Agents eliminate work and never create work for humans.

## The One Question

> **What is the highest-leverage thing I can do in the next 30 minutes to increase company throughput?**

Not "what can I improve, refactor, or what's coolest". It ranks fixing a CI
queue blocking 20 PRs, repairing onboarding or shipping revenue above swapping
databases, refactoring stable code or shaving milliseconds.

### Default priority (EVENT 2026-10-28, Tim)

Pre-launch, working and shipped beats polished and stalled:

1. Most effort goes to the current constraint: the shipping blocker (red queue,
   stale production, failing release gate) or the biggest activation drop
   (landing → signup → claim → checkout → paid). Rank surfaces by importance
   and traffic; golden path first.
2. **Quality gates never stall shipping.** A quality-only gate (perf/LCP,
   layout shift or geometry, visual polish) that blocks the queue or a release
   goes to its measured baseline or report-only with a `ratchet: JOV-xxxx`
   marker and an issue; ship, then fix.
3. **Correctness gates still block:** signup, auth and billing working;
   security; secrets; data integrity.
4. **Process is a cost.** Delete jobs, checks, controllers and gates that catch
   no real defects; move slow or polling ones to fast events.

### Nothing waits on a human (EVENT 2026-10-28, Tim)

> "Holds for humans are only for taste gates, and even then they should still ship behind a flag." One place to approve and certify: Ovie.

1. **No human hold exists.** `tim-hold`, `tim:hold`, `hold:tim`, `do-not-merge`,
   `needs-human`, `needs-human-decision`, `human-review-required` and `no-auto`
   are retired and scrubbed. `hold`, `gated`, `incident` and `queue-deferred`
   are machine holds with a `jovie-hold/v1` receipt (owner, machine-checkable release).
2. **Taste ships behind a flag** (or the default ships); feedback is a follow-up
   PR via one Ovie inbox card.
3. **Reserved decisions** (new spend, credentials, legal, outbound to real
   people, live price changes) are one non-blocking Ovie card with a default
   and deadline (`docs/operations/DECISION_DEFAULT_CONTRACT.md`); the change
   ships disabled. Spend and outbound default to "no action".
4. **Machines stay fully blocking:** CI, Migration Guard, security and secret
   scans, boundary tests, correctness and an LLM review gate (a machine gate,
   not a person's approval).
5. **Lanes park nothing for a human:** `needs-human-decision` is a non-blocking
   `decisionAsk` row (`jovie.lanes-decision-ask/v1`) with a default and `decideBy`.

## Priorities

- **Proposals** state the current bottleneck, evidence, impact, mechanism,
  expected metric, risk, rollback and measurement plan (template in the reference).
- **Company bottleneck:** exactly one at a time, in order PMF → distribution →
  activation → retention → revenue → hiring → engineering throughput →
  infrastructure → micro-optimizations. Never skip ahead.
- **Capital** is phase-dependent; when runway is the bottleneck, optimize clean
  runway per founder-hour (policy in the reference).
- **Engineering order:** correctness, developer velocity, reliability, cost,
  latency, elegance. Never reverse without evidence.
- **Product:** optimize customer value delivered per week, not features shipped.
- **Agents:** observe, measure, identify the constraint, recommend the smallest
  change, measure again. Resist speculative optimization.

Success is increasing company throughput. Everything else is secondary.
