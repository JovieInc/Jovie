# Jovie AI Pricing Strategy

> API roadmap: the [API pricing schema](#api-pricing-schema-proposal-jov-4875)
> below is a proposal, not an offer or billing configuration. For current
> subscription prices, use `apps/web/lib/config/plan-prices.ts`; the weekly
> packaging decision and cost scenarios below are historical planning context.

## Current paid offer (2026-10-20)

EVENT: Tim, 2026-10-20 — Jovie's first paid offer is a **$12/month
self-serve artist profile** (plan id `pro`, display name Artist Presence),
bought through `/claim` → sign-in → Stripe Checkout. It replaces the $199/month
"Artist Presence, limited access" tier and supersedes the $39/$149 Pro/Max
table below for new purchases. Context: $0 MRR and under three months of
runway; the wedge is musicians (artist profile plus the release/YouTube loop),
sold founder-led.

- Canonical price source: `apps/web/lib/config/plan-prices.ts`
  (`ARTIST_VISIBILITY_OFFER.pro.monthlyUsd = 12`). The pricing page, checkout
  price contract, entitlements registry and Stripe startup checks all derive
  from it.
- Monthly only. No annual Pro, no public Max price; Enterprise is contact sales.
- Payment never grants verification. High-profile artists (≥100k Spotify
  followers) cannot be claimed self-serve; they need manual verification.
- The retired $199 Stripe prices stay mapped to `pro` so existing subscribers
  keep their entitlements; they are no longer offered at checkout.
- The $199 Digital Footprint & Visibility Audit remains a separate one-off
  Payment Link and is no longer described as a first-month credit.

Ship now: $12/month with the existing Pro entitlements, including the
70-message weekly AI allowance.
Re-evaluate when: 30 paid users with two active weeks, or observed p90 AI cost
per paid user exceeds $6/month (50% gross margin at $12).
Then: lower the Pro weekly AI allowance or raise the price; do not cut the
profile, claim or release features that the offer is sold on.

## Historical packaging (superseded for new purchases)

> Status: weekly packaging approved for launch on 2026-08-17. Paid overage is
> still a proposal and must not launch until the telemetry, billing, and consent
> gates below pass. Governing principles live in
> [`PRICING-PHILOSOPHY.md`](./PRICING-PHILOSOPHY.md).

## Decision

Jovie sells the subscription, includes enough AI messaging for the normal job,
and uses additional completed responses as the variable-cost upsell.

The customer sees one meter: **Weekly messages**. Internal model calls, tool
steps, retries, and tokens are implementation details, not customer units.

## API pricing schema — proposal (JOV-4875)

Tim's August 7, 2026 directive in [JOV-4875](https://linear.app/jovie/issue/JOV-4875)
sets the API model: free to start, scale with successful usage. A business can
build before it can pay, with a bounded subsidy and strict rate limits. This
section is the canonical **proposal schema** for that model; it neither changes
the subscription schema nor creates a second SKU. The
[self-serve PM brief](../product/api-agentic-self-serve.md) owns the account,
payment, caching, and verification contracts.

The later [API priority lock](../../canon/strategy/theses/2026-09-03-apis-mcps-core-not-first.md)
keeps API/MCP/CLI access on the existing artist workflow, behind the YouTube
artist loop in priority. The
[bounded-subsidy thesis](../../canon/strategy/theses/2026-10-02-sell-outcomes-replaceable-substrate.md)
requires an explicit cost ceiling and exit. API access is a way to deliver the
artist outcome, not a standalone platform expansion.

All fields below describe a future versioned policy record, not new runtime
fields. `[VERIFY]` means unresolved, never zero, unlimited, or a default price.
An incomplete record cannot activate API paid usage. Tim must approve exact
amounts in a dated receipt before any price, Stripe meter/product, invoice,
charge, or live billing configuration is created or changed for this proposal.

| Field | Proposed contract | Approval / unresolved value |
|---|---|---|
| `approval` | Policy version, dated Tim decision, effective date, currency, operation-to-meter mapping | Exact amounts and activation receipt `[VERIFY]` |
| `billable_unit` | One successfully completed, customer-visible API operation, classified by operation type; no seats, tokens, internal tool steps, or retries | Operation catalog and any high-cost exclusions `[VERIFY]` |
| `billing_period` | Explicit UTC start/end; account-wide included units per meter, shared across keys and API/MCP/CLI | Period and reset policy `[VERIFY]` |
| `cache_hits` | A new successful logical operation consumes one unit even on a fresh cache hit; replay of the same operation consumes none | Disclose before opt-in; cached work has no extra crawl/LLM surcharge |
| `free_allowance` | Generous included units per account, bounded by per-period quota and subsidy budget; hard stop at exhaustion | Included units, subsidy ceiling, and reset `[VERIFY]` |
| `limits` | Strict per-account and per-key burst, sustained, concurrency, and expensive-operation limits, plus IP/signup abuse controls; paid accounts remain bounded | Numeric limits for each operation class `[VERIFY]` |
| `overage` | Explicit opt-in; charge only completed units beyond included allowance at the accepted policy rate | Unit rates, currency, rounding, invoice cadence, and volume bands `[VERIFY]` |
| `spend_cap` | Account-selected period cap, default paid authority zero; atomically reserve worst-case cost before work | Allowed caps and maximum per-operation reservation `[VERIFY]` |
| `subsidy_exit` | Stop at quota, cost ceiling, or abuse limit; offer opt-in paid use after approval; no automatic upgrade, debt, or retroactive charging | Trial cohort size and cost envelope `[VERIFY]` |

For an approved meter and period, `excess_units = max(0, completed_units -
included_units)`. The proposed amount is `excess_units × approved_unit_rate`,
using the approved currency/rounding rules. If volume bands are later approved,
they must replace that rule explicitly in the accepted policy version. Failed,
canceled, unauthorized, validation-blocked, rate-limited, and idempotently
replayed operations contribute zero billable units. Successful API operations
do not also consume a chat allowance for the same work.

Keep internal resource-cost telemetry separate from the customer meter. A cache
hit can reduce COGS without changing the quoted unit. Free allowance consumption
and paid excess allocation must be atomic across concurrent requests. No card
is required for free access; quota exhaustion cannot initiate checkout or a
charge without a valid delegated payment grant and explicit opt-in.

**Ship now:** reconcile this schema and the PM brief as documentation only.
**Re-evaluate when:** the existing API workstream produces account-level shadow
usage, cost, cache, and abuse evidence for a bounded cohort.
**Then:** Tim chooses exact allowances, limits, prices, caps, and the cohort
budget; implementation must pass the brief's payment and metering gates before
activation. No numeric API offer is approved by this document.

## Weekly allowances

| Plan | Price | Included AI messages | Limit behavior |
|---|---:|---:|---|
| Free | $0 | 15/week | Hard stop, upgrade to Pro |
| Pro Trial | $0 for 14 days | 50/week | Hard stop, upgrade to Pro |
| Pro | $39/month or $375/year (superseded: $12/month, 2026-10-20) | 70/week | Hard stop until paid overage is explicitly enabled |
| Max | $149/month or $1,430/year | 250/week | Hard stop until paid overage is explicitly enabled |

The plan quota is a rolling seven-day window. A separate 30-message hourly burst
limit remains in place to contain abuse and sudden provider spend.

These launch allowances are the smallest current envelope that is useful to
artists and remains plausible under today's unverified inference cost range.
They must be re-evaluated against observed Jovie cost-per-turn and retention
data using the thresholds below.

## Meter and upsell contract

- Show remaining capacity, not spend or internal credits.
- Show one warning line at 20% remaining.
- Use the normal accent above the line, warning color at or below the line, and
  error color only at zero.
- Free users see the Pro upgrade at warning and exhaustion.
- Pro users see Max as the next included-capacity option.
- Do not silently auto-upgrade, auto-charge, or imply that paid overage exists
  before its billing path is implemented and explicitly enabled by the user.

## Recommended paid overage

After the launch gate passes, offer **$0.12 per successfully delivered Jovie
response** above the included paid-plan allowance.

- Opt-in only.
- User-selected monthly spend caps, initially $10, $25, or $50.
- Aggregate charges onto the monthly invoice.
- Do not charge failed, canceled, validation-blocked, or idempotently retried
  turns.
- Keep image, audio, and other high-variance tools on their existing separate
  quotas.

This adopts the clearest proven parts of the market:

- Laylo separates its platform subscription from variable messaging capacity.
  That boundary is useful; its weighted credit arithmetic is not.
- Klaviyo moved mobile messaging from opaque credits to explicit dollar rates,
  estimated send cost, limit warnings, and opt-in flexible overage or plan
  upgrades. Jovie should copy the transparency and consent model.
- Klaviyo Customer Agent charges for resolved AI conversations rather than
  internal model work. Jovie should similarly count delivered responses.

Primary references:

- [Laylo pricing](https://help.laylo.com/Laylo-Pricing-11b23cdfc6158248961381ffb994fb7c)
- [Laylo messaging credits](https://docs.laylo.com/en/articles/6520299-messaging-credits)
- [Klaviyo mobile per-message pricing](https://help.klaviyo.com/hc/en-us/articles/52952739755931)
- [Klaviyo billing](https://help.klaviyo.com/hc/en-us/articles/115000976672)

## Cost model

Jovie routes general chat to Claude Sonnet 4 and simpler turns to Claude Haiku
4.5. A single customer message can trigger multiple model and tool steps. Vercel
AI Gateway charges provider list price without a token markup.

`turn cost = sum(model calls × token cost) + retries + external-tool cost`

Until Jovie records the full per-turn cost, use these inference-only planning
scenarios:

| Scenario | Calls and token assumption | Cost/message | Cost/100 | Cost/1,000 |
|---|---|---:|---:|---:|
| Low | 1 call, 2k input, 400 output, 80% Haiku | $0.0056 | $0.56 | $5.60 |
| Base | 1.5 calls, 5k input, 800 output, 40% Haiku | $0.0297 | $2.97 | $29.70 |
| High | 3 calls, 12k input, 2k output, 90% Sonnet | $0.1848 | $18.48 | $184.80 |

At the base scenario, the proposed allowances cost about $9/month for a fully
used Pro allowance and $32/month for a fully used Max allowance. A $0.12
additional response yields about 75% marginal gross margin before shared
infrastructure at that same base scenario.

Model-rate references:

- [Vercel AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)
- [Claude Sonnet 4 pricing](https://vercel.com/ai-gateway/models/claude-sonnet-4/providers)
- [Claude Haiku 4.5 pricing](https://www.anthropic.com/news/claude-haiku-4-5)

## Overage and pricing iteration gate

1. Record model, provider, input/output/cache tokens, tool steps, retries,
   external-tool cost, and final turn outcome for every customer message.
2. Review weekly messages and cost per customer at p50, p75, p90, p95, and p99
   by plan.
3. Confirm expected plan gross margin remains at least 50% and marginal overage
   gross margin remains at least 70%.
4. Enable paid overage only after explicit consent and spend-cap selection.

## Success, re-evaluation, and kill switches

Measure:

- Actual cost per completed response.
- Model mix, tokens, retries, and steps per turn.
- Weekly usage distribution by plan.
- Warning-to-upgrade conversion.
- Limit-hit abandonment and seven-day return rate.
- Overage revenue, COGS, refunds, and total plan gross margin.

Re-evaluate after 28 days of shadow data or 30 paid users with at least two
active weeks, whichever is later.

Stop or roll back the pricing test if:

- Cost attribution becomes unavailable.
- Rolling p90 cost exceeds $0.03 per completed response.
- Expected plan gross margin falls below 50%.
- Marginal overage gross margin falls below 70%.
- Limit-hit abandonment rises without a compensating paid-conversion gain.

Operational kill switches:

- Disable overage charging while preserving included access.
- Use the existing `ai_chat_force_light` control during a model-cost incident.
- Restore the prior quota configuration if the weekly-window rollout causes a
  material retention or support regression.
