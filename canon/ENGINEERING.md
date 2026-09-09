# Jovie Engineering Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-07-17

Engineering exists to increase company throughput by making the product correct, shippable, reliable, and easy to change.

---

## Engineering Optimization Order

Optimize in this order:

1. Correctness
2. Developer velocity
3. Reliability
4. Cost
5. Latency
6. Elegance

Never reverse this order without evidence that the lower item is the current bottleneck.

---

## Engineering Proposal Gate

Before starting engineering work, answer:

- Current bottleneck:
- Evidence:
- User/company metric affected:
- Smallest correct change:
- Verification command or production receipt:
- Rollback path:

If the work does not remove the bottleneck, do not do it unless it is a small, clearly correct safety fix.

---

## Default Technology Posture

Prefer boring technology. New technology is adopted only when it removes the current bottleneck.

Default stack remains:

- PostgreSQL
- TypeScript
- Next.js
- Supabase
- Upstash
- Stripe

Use upstream/open-source projects when they compound our work and reduce maintenance, but only through a bounded, reversible adoption path with evidence. Track upstream when that lets Jovie benefit from others' development work without surrendering control of the bottleneck.

---

## Shipping Rules

- Smallest correct change.
- One concern per PR.
- Draft PR early to start feedback.
- Merged is not done until production outcome is verified.
- A green local check is evidence, not completion.
- CI, migration guards, security gates, and production verification are not optional.

---

## Agent Engineering Rules

### Qualify delivery gates in shadow before enforcement

EVENT: Founder direction, 2026-09-09. Across every company product and
repository, a new or changed CI/delivery requirement that could stop shipping
must first run alongside existing delivery as a nonblocking qualification. Keep
existing required gates enforced. A new diagnostic evaluator reporting red must
not freeze otherwise qualified shipping.

Before promotion, record a representative cohort of multiple actual ships,
correctness and qualification pass rate, p95 qualification duration, throughput,
runner/cost impact, and failure isolation. Pass rate and p95 duration are separate
measurements. Propose explicit workload-specific thresholds and sample sizes;
do not claim the founder supplied a numeric threshold where none was specified.
Promote in bounded stages with an accountable owner and tested rollback. Restore
the prior qualified behavior if a novel gate collapses throughput. Queue tuning
also runs without delaying eligible shipping and must be supported by measured
headroom and reversible trials, not a guessed permanent optimum.

This is global policy, recorded here in the existing engineering canon. A Jovie
documentation change does not establish technical enforcement in other repos.
Each delivery owner must supply its own shadow and promotion receipts; existing
canonical review and governance paths apply this rule without a new control plane.

AI agents should:

1. Observe the bottleneck.
2. Measure or fetch evidence.
3. Make the smallest safe change.
4. Verify with real output.
5. Record the receipt.
6. Stop creating work for humans unless a decision genuinely needs founder judgment.

Agents should not:

- Refactor stable code without measurable benefit.
- Introduce new infrastructure because it is interesting.
- Bypass checks for speed.
- Create bot-to-bot chatter or routine progress noise.

---

## Relationship to Operational Rules

Concrete implementation lives in `../CLAUDE.md`, `../CODEX.md`, `.claude/rules/*`, `docs/PR_FLOW.md`, and tests. Those rules implement this canon. If operational rules conflict with this file, escalate to `OPERATING_SYSTEM.md` and update the lower-level rule.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
