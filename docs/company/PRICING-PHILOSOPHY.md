# Jovie pricing philosophy (public summary)

The operating rules for how Jovie decides pricing (thresholds, meter candidates,
decision tree, anti-patterns and the reasoning behind each) are private and live
in the `JovieInc/Ops` repo under `jovie-private/docs/company/PRICING-PHILOSOPHY.md`.
It was removed from this public repo on 2026-10-28. Private material is read via
`$JOVIE_PRIVATE_DIR` (default `~/Ops/jovie-private`); see
[strategy canon](../../canon/strategy/README.md).

This stub keeps the principle names that public docs and code cite. Read the
private document for their content before acting on one.

## Principle 1 — Pricing Is a Product, Not a Setting
## Principle 2 — Hybrid Is the Destination
## Principle 3 — Price the Work, Then the Outcome
## Principle 4 — Charge for Value That's Visible to the Customer
## Principle 5 — Free Tier Is a Wedge, Not Charity
## Principle 6 — Every Price Point Has a Kill-Switch and a Re-Evaluation Date
## Principle 7 — Cost-of-Goods Discipline

Every plan must hold at least 50% gross margin on AI and infrastructure cost at
expected usage. Any PR introducing recurring cost must update
[`docs/COST_MONITORING.md`](../COST_MONITORING.md) and disclose the cost impact
per [`.claude/rules/infra.md`](../../.claude/rules/infra.md).
