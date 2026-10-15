# LogYourBody (LYB) Launch Offer — 30-Day $5k MRR Plan

Status: Commercial proposal (price validation pending); audience/outcome
superseded by [JOV-6013 launch contract](../product/lyb-launch-contract.md)
Owner: Tim White (taste, spend, legal, credentials)
Last updated: 2026-10-15
Parent authority: [`/canon/OPERATING_SYSTEM.md`](../../canon/OPERATING_SYSTEM.md)
Issues: JOV-6066 (this offer), JOV-6065 (30-day $5k MRR governor), JOV-6020
(checkout/entitlement plumbing — not duplicated here)

The launch contract owns audience, outcome, and product breadth. This document
retains the commercial proposal and its paid-commitment validation bar; it
cannot authorize additional product surfaces.

## The offer (one ICP, one paid outcome)

**ICP:** People whose appearance is materially tied to their work: actors,
models, musicians, and creators. They need control around dates and constraints
such as shoots, performances, travel, summer, and maintenance phases. GLP-1 +
DEXA is an initial high-intent wedge, not an eligibility requirement. No
male-only, age-band, or existing-training-habit requirement defines this launch.

**Promised paid outcome (what they are buying):**
Proactive body-composition control around a user-selected outcome and date:
combine available signals, identify drift early, and deliver one clear next
action through Jovi with isolated health memory. The visual timeline and
stats/body score make progress understandable. Dates are planning constraints,
not guaranteed results. Delivery is iOS; web stays landing/support/account-only.

## Packages (one strong default)

| Package | Price | What it includes | Role |
|---|---:|---|---|
| **Self-Guided** | $79/mo | iOS timeline, stats/body score, Jovi coach and dated goal | Floor tier; exists to anchor the default |
| **Coached Block (default)** | $250/mo | Everything in Self-Guided + weekly adjustment against the dated goal + structured weekly check-in | Commercial proposal; validate paid demand |
| **Founding Cohort** | $400/mo, capped at 10 seats | Everything in Coached Block + direct async review of your check-ins by a human reviewer | Scarcity tier; tests ceiling willingness to pay |

Sell the default. Offer Self-Guided only on a price objection and Founding
Cohort only to prospects who ask for more access.

## Math to $5k MRR

Primary path — 20 paying customers at the default price:

- 20 × $250/mo = **$5,000 MRR**

Blended fallback (still ≥ $5k):

- 15 × $250 (Coached) + 4 × $400 (Founding) + 10 × $79 (Self-Guided)
  = $3,750 + $1,600 + $790 = **$6,140 MRR**

**Close-rate assumption: 25%** of qualified prospects (ICP match + existing
paid fitness spend + iOS) who are asked to pay will buy within 14 days.
25% × 80 qualified asks = 20 customers. Therefore the operating target is
**80 qualified paid asks in 30 days** (~3/day, ~20/week), starting with the
existing LYB user base and direct outreach.

**Ship now:** the packages above. **Re-evaluate when:** fewer than 3 of the
first 15 qualified asks convert (below ~20%), **then** test $199/mo on the
default before touching packaging. **Re-evaluate when:** more than half of
closed deals pick Founding Cohort, **then** the default is underpriced —
raise to $299/mo.

## Terms

- **No free trial** on any tier during the 30-day launch. The paid commitment
  is the evidence we need; a trial delays the willingness-to-pay signal past
  the governor window. This is revisitable only if close rate stays under 15%.
- **Onboarding fee: $0.** Setup is the product's job (onboarding ≤ 6 steps);
  charging for it adds friction without signal.
- **Cadence: monthly** via App Store IAP (RevenueCat entitlement; JOV-6020
  owns plumbing). An annual option at $2,000/yr for Coached Block (~2 months
  free) may be offered on request but is not on the landing price card —
  annual prepay obscures the 30-day MRR measurement.
- **Refund/cancel:** cancel anytime, effective at period end (store-standard).
  First-month 14-day money-back guarantee, no questions, on all tiers — this
  de-risks the ask without weakening the commitment. Refund requests are a
  lost-reason input, not a failure to hide.

## Validation contract

- Price is validated by **paid commitments, not surveys.** Acceptance requires
  at least 5 real prospects asked to pay at $250/mo (or a higher test price)
  before the offer is treated as confirmed; log each ask's outcome.
- Every lost deal records an objection reason (price, trust, timing, ICP
  mismatch, product gap). Iterate the offer on that evidence weekly.
- Pricing moves only on close/retention evidence per the re-evaluation
  triggers above — never on preference.

## Composition and locks

- Checkout, entitlements, and RevenueCat/App Store plumbing: **JOV-6020**.
  This document owns ICP, outcome, packages, price, and terms only.
- LYB web remains **landing-only**; product is iOS on Neon; coach is
  powered-by-Jovie. Taste, spend, legal, and credential decisions stay with
  Tim. Summer governor applies. Ops agents write no product code.
- Sales-surface copy for the landing page is below; it is the only approved
  launch language and ships to the LYB landing (separate repo) verbatim or
  under Tim's edits.

## Approved sales-surface copy (landing price section)

Headline: **Your body-composition goal, planned around your next date.**

> Set an outcome and a date. LogYourBody follows your photos and measurements,
> spots drift, and gives you one next action. Built for people whose appearance
> is part of their work. iOS only.

Price card (default shown first):

- **Coached Block — $250/mo.** Your next action, adjusted weekly from your
  goal, photos, and measurements. Weekly check-in. Cancel anytime; 14-day
  money-back on your first month.
- Founding Cohort — $400/mo (10 seats). Everything above plus direct async
  review of your check-ins.
- Self-Guided — $79/mo. Timeline, stats, and your coach, on your own.

No trial language. No "coming soon" tiers. No other ICP language on any
launch surface.
