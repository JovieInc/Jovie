# LogYourBody launch acquisition plan (JOV-6072)

Parent governor: JOV-6065 (30-day $5k MRR). This plan owns channel focus and
source→paid attribution. It does not own the daily prospecting→demo→close motion
(JOV-6068), the design-partner close loop (JOV-6074), offer/pricing lock
(JOV-6066), or the lander→demo→checkout surface (JOV-6071). Where any of those
land differently, this doc re-reconciles.

## Channel lock

- **Primary (locked): founder-led warm/direct outbound.** Feeds the JOV-6068
  sales machine: Tim runs daily prospecting → qualified conversation → demo →
  checkout, powered-by-Jovie coach positioning, LYB web landing-only. No
  evidence contradicts this default; it is the only channel whose conversion
  is fully inside our control for a 30-day window.
- **Secondary (at most one, gated):** chosen only after JOV-6066 locks
  ICP/outcome/price and JOV-6071 ships the lander→demo→checkout path. Selection
  rule: pick the single candidate whose audience most overlaps the locked ICP
  and where an attributable link exists (UTM on the lander). Candidates, in
  priority order:
  1. Direct niche communities where the locked ICP already congregates
     (non-Reddit-sprawl; two or three named communities, posted by Tim only).
  2. Existing warm-network referrals with an ask-for-intro script and an
     attributable referral link.
  3. Founder-led content on one owned surface pointing at the lander.
  Paid ads, SEO, affiliates, TikTok, broad Reddit, and partnerships are out of
  scope for the 30-day window.
- **Cap:** no more than two channels receive constrained capacity at once.
  Exceeding the cap requires an explicit Summer governor override recorded on
  the Linear issue.
- **Respected locks:** no cold X/Twitter (@itstimwhite restricted); no channel
  spend without Tim's spend gate; taste/legal/credential/external-send
  approvals stay with Tim; Ops writes no product code.

## Audience and source lists

- **Primary list:** Tim's warm network and prior replies — former colleagues,
  creator/founder contacts, anyone who has engaged with LYB or Jovie content,
  plus direct-fit ICP lookups once JOV-6066 locks the ICP. Maintained as the
  outbound working list; every row carries `source = warm-outbound` plus a
  named sub-source (e.g. `intro:<name>`, `prior-thread`, `icp-lookup`).
- **Secondary list:** defined when the secondary channel is selected; each
  entry gets an attributable link or tagged ask before any traffic is sent.

## Weekly targets (reconciled to $5k MRR)

JOV-6066 has not yet locked price, so targets are expressed as the formula
that reconciles to the $5k MRR model; substitute the locked price when it
lands.

- `paid_customers_needed = ceil(5000 / price_monthly)`
- `qualified_conversations_needed = ceil(paid_customers_needed / conv_to_paid)`
- `leads_needed = ceil(qualified_conversations_needed / lead_to_conv)`

Illustrative scenario (replace with locked inputs): at $50/mo → 100 paid
customers over 30 days ≈ 25/week. At a 20% qualified-conversation→paid close
rate → 125 qualified conversations/week; at 40% lead→conversation → ~310 new
leads/week into the JOV-6068 pipeline. Warm outbound normally closes better
than cold; if observed close rate exceeds 20%, the lead target drops
proportionally. Re-run this math the day JOV-6066 lands and again at day-7
actuals; if observed rates can't support the target on two channels, escalate
to the governor rather than adding a third channel.

## Attribution instrumentation

Goal: a knowable acquisition source on every paid user — no analytics
platform, just a live attributable funnel.

1. **Capture:** every entry point stamps `acquisition_source` at first
   contact — UTM parameters on lander links for any non-outbound channel;
   a required source field on the outbound working list for outbound.
2. **Persist:** source travels with the record through demo → checkout (Stripe
   metadata on the subscription/customer record, or the LYB RevenueCat
   subscriber attribute equivalent for app-store conversions).
3. **Ledger:** one weekly rollup per source: leads → qualified conversations →
   demos → paid → retained (still subscribed at day-14). The ledger is a
   shared doc/sheet plus the Stripe/RevenueCat readback — the same source-of-
   truth discipline as `lyb-daily-mrr.md`: a configured field is not a
   captured value.
4. **Attribution gaps:** a paid user with no recorded source is logged as
   `unknown` and investigated, not silently bucketed.

## Measurement and kill rules

- Score channels on **qualified conversations, paid, and retained users** —
  never impressions, followers, or reach alone.
- CAC and founder-time cost are tracked per channel where measurable
  (outbound hours/week; secondary channel hours + any gated spend).
- **Kill/pause rule:** a channel that produces zero qualified conversations
  after two full weekly cycles, or whose founder-hours-per-paid is materially
  worse than outbound's, is paused and its capacity reverts to the primary
  channel.
- **Reallocation rule:** a candidate channel replaces the secondary only when
  evidence shows materially higher expected objective return (paid per
  constrained hour/dollar); the swap and the evidence are recorded on the
  Linear issue.

## Open dependencies

- JOV-6066 (offer/pricing): unblocks the secondary-channel selection and the
  numeric targets above.
- JOV-6071 (launch surface): unblocks secondary-channel traffic routing.
- JOV-6068: owns the daily outbound motion this plan feeds; weekly lead
  targets above are input to its prospecting volume.
- JOV-6074: design-partner closes count as `source = warm-outbound` in the
  attribution ledger.
