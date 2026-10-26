# Price changes: notice before effect

Existing subscribers are told before a price change applies. The Terms promise
"notice of a price change before it applies to your next renewal"; we read that
as `PRICE_CHANGE_NOTICE_DAYS` (30) days, set in `rules.ts`.

## To change a price for an existing plan

1. Create the new Stripe price (test mode first). Add its id under a new
   `STRIPE_PRICE_*` env key.
2. Add a record to `registry.ts` (`id`, `priceKey`, old/new cents, both env keys,
   `effectiveDate` at least 30 days from today, `reason`). Merge it. Do NOT touch
   the live price yet.
3. The daily maintenance sweep (`run.ts`) lists the affected Stripe subscriptions
   (active, trialing, past_due, paused, unpaid, incomplete), queues one notice per
   subscription, and sends it. Delivery is recorded in `price_change_notices`.
4. At the effective date the sweep switches each subscription to the new Stripe
   price (no proration) only if EVERY affected subscription has a valid notice;
   otherwise the whole change is held and a critical incident is raised. A
   notified subscription switches no earlier than its notice + 30 days.
5. In a later commit (on or after the effective date) change the live price in
   `plan-prices.ts`. The CI guard accepts it only because step 2 was merged earlier.

New prices for new plans need no record. Price decreases need no record.

## Guarantees and their guards

| Guarantee | Guard |
| --- | --- |
| No live-price edit without a merged record and a full window | `scripts/check-price-change-guard.ts` + `.github/workflows/price-change-guard.yml`, `guard.test.ts` |
| Extractor sees every price file | `live-prices.test.ts` |
| Nothing else swaps a subscription's price | `stripe-mutation-allowlist.test.ts` |
| One notice per subscriber | unique `(change_id, subscription_id)` + conditional claim, `pipeline.test.ts` |
| A skipped, failed or bounced send is not a notice | `gate.ts` (`validNoticeAt`) |
| Missing notice blocks the switch | `gate.ts`, `pipeline.test.ts` |

## Switches (all default OFF)

- `PRICE_CHANGE_NOTICE_SEND_ENABLED=true` actually emails subscribers.
- `PRICE_CHANGE_APPLY_ENABLED=true` actually switches subscriptions.
- `PRICE_CHANGE_APPLY_LIVE=true` is additionally required for a live-mode Stripe key.

## Not built yet

- Annual price changes (a notice window aligned to the renewal date).
- An in-app banner as the alternate channel for permanent bounces; today
  `recordFallbackNotice` documents one made by a person.
- Notice copy is a draft (`price-change-notice.ts`); Tim owns the wording.
