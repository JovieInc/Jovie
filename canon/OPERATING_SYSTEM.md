# Jovie Operating System

Version: 1.0
Status: Constitution (highest authority)
Owner: Tim White
Last updated: 2026-07-17

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

This constitution sits **above** the four operating principles in [`../docs/company/operating-principles.md`](../docs/company/operating-principles.md). Those principles (Ship Fast, Run Experiments, Document Everything, MRR Is King) remain valid and are the operational mechanism for this constitution:

- **MRR Is King** is how we measure throughput in dollars — the customer paying is the strongest signal (Law 7).
- **Ship Fast, Iterate** is Law 6 in practice.
- **Run Experiments When in Doubt** is Law 2 in practice.
- **Document Everything** is how the closed loop keeps compounding (Laws 1–2 depend on durable evidence).

When operating-principles or a `.claude/rules/*` file gives concrete implementation, follow it. When it is silent or in tension, resolve upward to this document.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-07-17 | Created `/canon/OPERATING_SYSTEM.md` as company constitution (Theory of Constraints operating model). | Tim White |
