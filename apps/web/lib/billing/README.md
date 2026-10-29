# lib/billing

Stripe-backed billing concerns that don't belong in entitlement registries or query hooks. This directory is intentionally thin — most plan-gating logic lives in **`lib/entitlements/`** and most client state lives in **`lib/queries/usePlanGate.ts`**.

What's here:

- **[`commerce/`](commerce/README.md)** — versioned agentic-commerce support projection and evidence validator over canonical offer, price, product, and checkout sources.
- **`verified-upgrade.ts`** — price selection and label formatting for the verified-upgrade flow. `getPreferredVerifiedPrice()` picks the right Stripe price based on the user's currency / locale; `formatVerifiedPriceLabel()` produces the marketing string.
- **`reconciliation/`** — batch tooling that detects and repairs drift between local subscription state and Stripe.

## Plan tiers (canonical: `lib/entitlements/registry.ts`)

- **Free** — limited analytics window, capped contacts, capped weekly AI messages
- **Pro** (Artist Presence) — monthly self-serve (price: `ARTIST_VISIBILITY_OFFER.pro.monthlyUsd`) via `/claim` (EVENT: Tim, 2026-10-20; canonical: `lib/config/plan-prices.ts`). Retired prices stay mapped as legacy for existing subscribers (see `lib/stripe/legacy-prices.ts`). Verification is never granted by payment.
- **Max** — contact sales, no public price; legacy subscribers only — Pro plus team management, webhooks, email campaigns
- **Trial** — 14-day reverse trial granting Pro-tier features (with a tighter notification cap, see `feedback_pricing_strategy` in memory)

## Trial-aware upgrade nudges (commit 8a27e3fec, Phase 1)

Phase 1 shipped the price-formatting plumbing used by the upgrade banners. The 8-state nudge machine itself lives at `lib/queries/usePlanGate.ts:deriveNudgeState()`:

```
never_trialed | trial_honeymoon | trial_late | trial_last_day
recently_lapsed | stale_lapsed | pro_paid | max_paid
```

Banner copy and CTAs are mapped per state in `apps/web/components/.../SidebarUpgradeBanner.tsx` via `buildVariant()`. To add a trigger: extend `NudgeState`, update `deriveNudgeState()` thresholds, and add the matching `BannerVariant` case.

## Reconciliation

`reconciliation/batch-processor.ts` paginates users, compares each to Stripe, and routes mismatches:

- `status-mismatch-fixer.ts` — corrects `isPro` / status drift
- `orphaned-subscription-handler.ts` — handles subscriptions present in DB but missing in Stripe
- `subscription-error-classifier.ts` + `subscription-status-resolver.ts` — classify errors and resolve canonical status

## Adding a new entitlement

Edit `lib/entitlements/registry.ts`:

1. Add the key to `BooleanEntitlement` or `NumericEntitlement`.
2. Set per-plan values (free, pro, max, trial).
3. The hook (`usePlanGate`) and server resolver (`getCurrentUserEntitlements`) pick it up automatically.
4. Add a marketing description to the plan's `features` array if it should surface in pricing UI.

## Price lock (Tim, 2026-10-29)

A person always gets the price they signed up at. One consistent price everywhere is a legal invariant (JOV-INV-047).

- **Registry:** `price-versions.ts` names each list price (`PRICE_VERSIONS`, `CURRENT_PRICE_VERSION_ID`). A test fails when the list price in `lib/config/plan-prices.ts` moves without a new version. To change the price (JOV-9769): append a version, make it current, then change the list price and Stripe env. Existing locks keep their own snapshot, so the change reaches new signups only. Live Stripe price changes need Tim's yes through an Ovie card.
- **Record:** `price_locks` (one row per user: version id, amounts, Stripe price ids, timestamp, source). Written at sign-up (`lib/auth/provision.ts`, `lib/auth/gate.ts`), waitlist join/redeem, or first need (`ensurePriceLockForUser`). First write wins. Paying subscribers are backfilled from the price they pay (`backfillSubscriberPriceLocks`, run by the daily reconcile); unpaid existing users lock on first need at the list price they are then shown.
- **Honor:** `resolveCheckoutPriceForUser` (checkout, plan change, plan-change preview; fails closed), `GET /api/billing/price-lock` (the person's own quote for the UI, emails and agent/API callers), `usePricingOptionsQuery` (applies the lock to the list), `LockedPlanPrice` (signed-in /pricing). Retired locked prices still check out: `assertCheckoutPriceContract` takes the lock as the expectation.
- **Guard:** `tests/unit/billing/price-lock-guard.test.ts` (allowlist of list-price readers, shrink only) and the daily reconcile (`price-lock-reconcile.server.ts`, inside the billing-reconciliation cron). A mismatch pages Summer through the revenue-spine `plan_mismatch` failure; overcharge is `blocked`.
- **Disclose:** `PriceLockNote` / `priceLockDisclosure`: "Your price is locked at <amount>. It stays the same if the list price changes." Rendered only when a lock exists.
- **Emails:** the paid-welcome email names the plan, not an amount. Any email that quotes a price must call `GET /api/billing/price-lock`'s resolver (`ensurePriceLockForUser` + `resolveLockedPrice`), never `PLAN_PRICES`; the guard fails a new reader.
