# Jovie Operating System: reference

On-demand detail for the constitution in [OPERATING_SYSTEM.md](OPERATING_SYSTEM.md),
which governs. Read this when writing a proposal, judging the company
bottleneck or capital, or resolving where canon sits. Moved verbatim from the
constitution on 2026-10-29 to cut always-loaded agent context.

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
| 2026-10-29 | v1.3: condensed the constitution with no rule removed; moved the proposal template, bottleneck order detail, capital policy, canon lineage and this changelog here (always-loaded context 12 KB to ~6 KB). | Coordinator, waste audit |
| 2026-10-20 | Law 2 hard rule: new pipelines and features must emit stage timestamps and a metric to be done. | Tim White |
| 2026-08-17 | Point at `FLEET.md` as the closed-loop / default-alive operating contract. | Tim White interview |
| 2026-08-13 | Added phase-dependent capital policy: survival before selectivity, fast-path clean SAFEs, and no investor-theater requirement. | Tim White |
| 2026-07-17 | Created `/canon/OPERATING_SYSTEM.md` as company constitution (Theory of Constraints operating model). | Tim White |
