# Jovie Product Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-08-28

Product exists to increase customer value delivered per week.

Features, polish, experiments, and roadmap items are valid only insofar as they remove the current company bottleneck.

---

## Product Goal

Increase the rate at which customers reach and repeatedly receive value from Jovie.

Primary product question:

> What is the smallest product change that removes the current customer-value bottleneck?

---

## Product Bottleneck Ladder

For product work, classify the bottleneck before proposing a solution:

1. Customer cannot reach production.
2. Customer cannot create an account.
3. Customer does not reach first value.
4. Customer does not start a paid plan.
5. Customer does not complete payment.
6. Customer does not return/retain.
7. Customer does not invite or attract the next customer.

Unknown means measure. Do not guess.

---

## Required Product Proposal Shape

Every product proposal must answer:

- Current bottleneck:
- Customer evidence:
- Metric to improve:
- Expected improvement:
- Smallest reversible change:
- Verification receipt:
- Rollback:

If these fields cannot be answered, the next product task is evidence gathering.

---

## Prioritization Rules

1. Customer behavior outranks internal opinion.
2. Paid behavior outranks free behavior.
3. Retention behavior outranks stated intent.
4. Activation blockers outrank polish unless polish is the activation blocker.
5. A shipped, measured experiment beats a perfect roadmap.

---

## Continuous Optimization

Jovie is a continuously optimizing system, not a static link, page, or asset generator. Every shipped user-facing page, link, asset, campaign, recommendation, or content variant carries an internal optimization contract, or the work is an explicit non-product or non-optimizable exception.

Use the existing analytics, model-experiment, audience-event, YouTube-experiment, and release-to-revenue surfaces. Do not create a parallel analytics stack.

### Learning hierarchy

Narrower reliable evidence overrides broader evidence. Broader evidence is a prior only.

1. Platform
2. Medium or channel
3. Country or locale
4. Genre or cohort
5. Artist plus career era or lifecycle
6. Content variant
7. Consented audience segment
8. Fan

Never transfer immutable artist facts or incompatible cohort traits. ZZ Top may inherit a rock-level presentation prior; it must not inherit Kings of Leon's career-era facts or audience assumptions.

### Objective hierarchy

1. Artist business outcome
2. Durable fan value
3. Engagement as an intermediate signal only

Guardrails: complaint, trust, and brand. Personalize at fan level only from first-party, consented behavior. Sensitive demographic inference and cross-platform identity stitching require a separate explicit decision.

### Optimization contract

Required fields: stable variant identity, exposure, outcome, attribution, eligible context dimensions, hypothesis and primary metric, guardrails, privacy and consent, optimizer owner and cadence, decision writeback, and rollback or control.

Automatically promote only bounded, reversible variants after evidence thresholds. Identity or brand permanence, legal or privacy changes, external publication, and material spend remain gated.

Machine enforcement: [`JOV-INV-012`](./invariants.jsonl).

---

## Anti-Goals

Do not optimize for:

- Features shipped.
- Agent output volume.
- Internal excitement.
- Competitor parity without customer evidence.
- Technical elegance without user throughput impact.

---

## Relationship to Other Canon

- Engineering implements the smallest correct product constraint removal.
- Design makes value legible and reduces friction.
- Marketing creates qualified demand for the current product bottleneck stage.
- Voice makes the customer promise clear and truthful.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-08-28 | Continuous-optimization doctrine, learning hierarchy, safe transfer, and objective hierarchy. | Tim White / JOV-4045 |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
