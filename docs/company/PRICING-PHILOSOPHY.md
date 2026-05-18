# Jovie Pricing Philosophy

Canon. How we **decide** pricing — distinct from [`PRICING-STRATEGY.md`](./PRICING-STRATEGY.md), which documents what we charge **right now**. Strategy is the snapshot; philosophy is the operating rules that govern how the snapshot changes.

Read [`pricing-trends-summary.md`](./pricing-trends-summary.md) first if you haven't — these principles are the Jovie translation of that data.

When a future agent or teammate asks "should we change pricing?", "should we test a price increase?", or "should we add a new tier?", the answer lives here.

## Principle 1 — Pricing Is a Product, Not a Setting

Pricing ships, gets measured, gets re-shipped. Same lifecycle as any feature.

- **Cadence:** quarterly review minimum. Default to "yes, change it" if there's a hypothesis backed by ≥30 conversion data points.
- **Treat the price page like a landing page:** subject to the same A/B discipline (see [`operating-principles.md`](./operating-principles.md) Principle 2 — experiments are bounded; one concurrent test per surface).
- **Stripe data backs this:** 87% of hyper-growth companies changed price 3+ times in 2 years. 33% of low-growth did. Pricing motion is correlated with growth motion.

## Principle 2 — Hybrid Is the Destination

Subscription base captures predictability for the business. Usage meter captures upside as artists scale. Both must exist by the time Jovie crosses $50K MRR. Until then, flat tiers are fine — the usage data isn't there yet.

- Current caps (5 / 100 / 500 AI messages per day) are *limiters*. The hybrid future converts them into *meters* (overage, credit packs, or both).
- Meter candidates, ranked by signal-to-implementation cost: fan-notification batches, canvases generated, releases launched, campaigns drafted, AI messages above plan.
- **57% of hyper-growth companies use hybrid pricing.** This is not a fringe pattern.
- The migration story is tracked in [JOV-2450](https://linear.app/jovie/issue/JOV-2450) — this doc says *that* it happens, not *when*.

## Principle 3 — Price the Work, Then the Outcome

Three pricing shapes for AI surfaces, in order of attribution difficulty:

1. **Per-seat** — wrong for agents. An agent does not have a seat. Never use this for any Jovie AI surface.
2. **Work-based** — per artifact produced (per canvas generated, per campaign drafted, per release plan written, per notification batch sent). Mechanically verifiable. Default for new AI surfaces.
3. **Outcome-based** — per booking won, per first-paying-fan converted, per release-week stream lift above baseline. Highest perceived value, hardest to attribute. Earned, not assumed.

Move from work-based to outcome-based only when the attribution loop is closed (the data exists, the artist agrees the outcome is real, the dispute path is defined). Until then, work-based is honest and outcome-based is fiction.

## Principle 4 — Charge for Value That's Visible to the Customer

Upgrade conversion follows visibility. The artist's audience (fans, bookers, curators) is the secondary customer — anything they can see drives the primary customer to upgrade.

- **Strong upgrade levers:** verification badges, fan-facing analytics, white-label / branding removal, premium domain, public artist OS surfaces.
- **Weak upgrade levers in isolation:** faster model, larger context window, more advanced AI — invisible to the audience, so the artist has to take them on faith.
- **Implication:** when packaging features into tiers, lead with what the audience sees. Hide the invisible-but-real value (better AI, deeper analytics) as supporting bullets, not headline reasons to upgrade.

## Principle 5 — Free Tier Is a Wedge, Not Charity

Free exists for two reasons:

1. Demonstrate the AI manager's voice, taste, and judgment — so the artist understands what they're paying for.
2. Seed the network with claimed profiles — so the platform has gravity before paid conversion is large.

If free-tier paid-conversion is below 2% at 6 months: free is too generous in cost without enough wedge value — tighten it. If conversion is above 10%: free is leaving demand on the table — test tightening anyway. Conversion in the 2-10% band is the working range.

Free is never a retention tool for churn-risk paid users. A paid user signaling churn is a product problem, not a pricing problem. Do not raise free-tier limits to win them back.

## Principle 6 — Every Price Point Has a Kill-Switch and a Re-Evaluation Date

No price is permanent. Every price in [`PRICING-STRATEGY.md`](./PRICING-STRATEGY.md) must come with:

- **The hypothesis** that motivated the price (why this number, not 20% higher or lower).
- **The re-evaluation trigger** (calendar date or metric threshold — whichever comes first).
- **The kill-switch criteria** (data conditions that would make us roll the price back).

No price hike happens without a Linear issue and a screenshot of the data that justifies it. No silent re-pricing. Grandfathering is fine when explicit; infinite implicit grandfathering is debt.

## Principle 7 — Cost-of-Goods Discipline

Every plan must hold **≥50% gross margin on AI and infrastructure cost at expected usage**. The expected number, not the worst case — worst case is a separate column.

- If a tier dips below 50% margin: raise price *or* tighten quota — never both silently in the same release. Pick one, document why, ship it.
- Cost transparency lives in [`docs/COST_MONITORING.md`](../COST_MONITORING.md). Any PR introducing recurring cost (cron, polling, model inference) must update that document and disclose the cost impact in the PR description per [`.claude/rules/infra.md`](../../.claude/rules/infra.md).
- A tier whose expected cost can exceed 50% of its price under reasonable usage is not a tier — it's a subsidy.

## Decision Tree — "Should We Change Pricing?"

1. Do we have a **hypothesis**, written down, with a metric and a magnitude? If no → wait. Vibes are not a hypothesis.
2. Do we have **≥30 data points** on the current behavior we're trying to change? If no → ship a smaller test that generates those data points, or wait until they exist.
3. Is the change **reversible** within a week without breaking customer trust? If yes → ship the test. If no → shrink the change until it is reversible.
4. Does the change have a **kill-date**? If no → set one (default: 30 days). Do not run open-ended pricing tests.
5. Is the **MRR impact** modeled (lift / preserve / accept-as-cost)? If no → model it before launch, per [`operating-principles.md`](./operating-principles.md) Principle 4.

If 1-5 all pass: ship it. Write the post-mortem (won / lost / null) before shipping the next pricing test.

## Anti-Patterns (Forbidden by Default)

| Anti-pattern | Why it's banned |
|---|---|
| Copying a competitor's price without a hypothesis | They might be wrong. They almost certainly have different unit economics. |
| Infinite implicit grandfathering | Creates a long tail of users at prices the business no longer supports. |
| Hiding price ("contact us" before $1M ARR) | Friction without information. Trust is built on transparency at this stage. |
| Raising free-tier limits to retain churning paid users | Trains users that threatening to leave gets them free product. Solve the product problem. |
| Per-seat pricing for AI surfaces | An agent does not have a seat. (Principle 3.) |
| Bundling visible and invisible value to obscure the lever | If a tier upsell is real, lead with the visible feature. If it isn't, don't ship the tier. |
| Pricing changes without a kill-date | Open-ended experiments rot into permanent state. (Principle 6.) |
| Pricing changes without an MRR thesis | Violates MRR-Is-King principle. (See [`operating-principles.md`](./operating-principles.md) Principle 4.) |

## When This Document Updates

Edit this file when:

- A principle proves wrong in practice (write the lesson in [`/LESSONS.md`](../../LESSONS.md) first; then update the principle here).
- A new pricing shape becomes relevant (e.g. when usage data justifies meters → expand Principle 2).
- An anti-pattern needs to be added because we tripped over it.

Edits should be additive when possible. Strike-throughs are fine for retired principles; deletions are fine for things we got wrong. Document the change in the commit message.

## Related Canon

- [`PRICING-STRATEGY.md`](./PRICING-STRATEGY.md) — current price points, AI quotas, cost-of-goods table.
- [`pricing-trends-summary.md`](./pricing-trends-summary.md) — the Stripe data this philosophy is grounded in.
- [`operating-principles.md`](./operating-principles.md) — Ship Fast / Experiments / Document Everything / MRR Is King.
- [`docs/COST_MONITORING.md`](../COST_MONITORING.md) — cost discipline operationalized.
- [`.claude/rules/release.md`](../../.claude/rules/release.md) — PR discipline, including Cost Impact section.
- [`.claude/rules/infra.md`](../../.claude/rules/infra.md) — recurring-cost guardrails.
