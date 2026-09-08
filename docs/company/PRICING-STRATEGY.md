# Jovie AI Pricing Strategy

> Status: weekly packaging approved for launch on 2026-08-17. Paid overage is
> still a proposal and must not launch until the telemetry, billing, and consent
> gates below pass. Governing principles live in
> [`PRICING-PHILOSOPHY.md`](./PRICING-PHILOSOPHY.md).

## Decision

Jovie sells the subscription, includes enough AI messaging for the normal job,
and uses additional completed responses as the variable-cost upsell.

The customer sees one meter: **Weekly messages**. Internal model calls, tool
steps, retries, and tokens are implementation details, not customer units.

## Weekly allowances

| Plan | Price | Included AI messages | Limit behavior |
|---|---:|---:|---|
| Free | $0 | 15/week | Hard stop, upgrade to Pro |
| Pro Trial | $0 for 14 days | 50/week | Hard stop, upgrade to Pro |
| Pro | $39/month or $375/year | 70/week | Hard stop until paid overage is explicitly enabled |
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
