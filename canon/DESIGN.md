# Jovie Design Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-07-17

Design exists to increase customer throughput: make the next correct action obvious, trustworthy, and valuable.

---

## Design Goal

Reduce friction between customer intent and customer value.

Primary design question:

> What is the smallest design change that helps more customers reach the next value moment?

---

## Design Bottlenecks

Design work is justified when evidence shows one of these is limiting throughput:

1. Customers do not understand the promise.
2. Customers cannot find the next step.
3. Customers do not trust the action.
4. Customers abandon due to visual or interaction friction.
5. Customers cannot perceive the value they received.
6. Customers do not know what to do next.

---

## Required Design Proposal Shape

- Current customer bottleneck:
- Evidence (analytics, session, interview, support, screenshot, or user behavior):
- Metric to improve:
- Smallest design change:
- Before/after verification:
- Rollback:

---

## Principles

- Clarity beats novelty.
- Conversion-critical paths outrank decorative polish.
- Polish is required when lack of polish blocks trust or activation.
- Layout stability is part of correctness.
- Taste matters, but customer behavior is stronger evidence.

---

## Anti-Goals

Do not spend design effort on:

- Visual novelty disconnected from activation, retention, trust, or revenue.
- Redesigning stable surfaces because they feel old.
- Animations that do not improve comprehension or conversion.
- Component churn without product bottleneck evidence.

---

## Relationship to Root Design System

`../DESIGN.md` is the operational design-system reference. This file defines why and when design work matters; `../DESIGN.md` defines how to execute it correctly.

**Execution lock (founder-directed 2026-06-18):** one design system, two languages.
System B tokens only; product language + marketing editorial language. Historical
"System A" is not a valid choice for new work. Component prefer/forbid map:
[`docs/design/COMPONENT_MAP.md`](../docs/design/COMPONENT_MAP.md).

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
| 2026-07-23 | Cross-link one-system lock + component map. | Tim White / design-system docs lane |
