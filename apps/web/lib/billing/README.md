# lib/billing

Stripe-backed billing concerns that don't belong in entitlement registries or query hooks. This directory is intentionally thin — most plan-gating logic lives in **`lib/entitlements/`** and most client state lives in **`lib/queries/usePlanGate.ts`**.

What's here:

- **`verified-upgrade.ts`** — price selection and label formatting for the verified-upgrade flow. `getPreferredVerifiedPrice()` picks the right Stripe price based on the user's currency / locale; `formatVerifiedPriceLabel()` produces the marketing string.
- **`reconciliation/`** — batch tooling that detects and repairs drift between local subscription state and Stripe.

## Plan tiers (canonical: `lib/entitlements/registry.ts`)

- **Free** — limited analytics window, capped contacts, capped daily AI messages
- **Pro** — $39/mo or $375/yr — verified badge, full analytics, notifications, pre-save campaigns
- **Max** — $149/mo or $1430/yr — Pro plus team management, webhooks, white-label, email campaigns
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
