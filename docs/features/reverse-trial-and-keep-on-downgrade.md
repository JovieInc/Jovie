# Reverse-Trial + Keep-on-Downgrade Billing Mechanics

> **Status:** Spec only. Tracks [GitHub #12147](https://github.com/JovieInc/Jovie/issues/12147).
> No code, flag, or paywall change ships with this document — it is the
> implementation contract. Child implementation issues are filed once this spec
> is confirmed (see [Implementation Plan](#implementation-plan)).

## Executive Summary

Two deliberate, productized billing mechanics, both grounded in the issue's
"never reject what you can degrade" guardrail — which maps to
[`PRICING-PHILOSOPHY.md`](../company/PRICING-PHILOSOPHY.md) Principle 5 (free
tier is a wedge) and Principle 4 (charge for visible value):

1. **Reverse-trial** — a new user gets the **full Pro feature set on signup with
   no credit card** (with trial-scaled usage limits, see Part 1), for a fixed
   window. When the window ends without a card on file, the account **degrades
   into a paywall** (drops to Free), it does not silently keep Pro and it does
   not delete anything. The trial is granted **once per identity**.
2. **Keep-on-downgrade** — when any paid plan (or a lapsed trial) ends, the
   artist **keeps their public profile, smart links, and owned data**; only the
   paid-only capabilities (automation, advanced analytics, notifications,
   monetization) **lock**. Nothing the artist created is destroyed.

The difference from today: the current `trial` plan is a **trial-then-free**
artifact whose Stripe lifecycle is never wired up, and "downgrade" today means
`isPro=false` with no defined data-retention contract. This spec turns both into
deliberate mechanics driven by the existing hardened Stripe webhook pipeline.

---

## Current State (Verified Against Code)

### What already exists

| Capability | Where | Notes |
|---|---|---|
| `trial` plan entitlements | `apps/web/lib/entitlements/registry.ts:308-327` | Pro booleans + scaled limits (250 contacts, 25 AI msgs/day, 3 pitch gens). Tagline "14 days of Pro, on us." |
| Trial notification cap | `apps/web/lib/entitlements/registry.ts:331` | `TRIAL_NOTIFICATION_RECIPIENT_LIMIT = 50` |
| Trial DB columns | `apps/web/lib/db/schema/auth.ts:46-50` | `trialStartedAt`, `trialEndsAt`, `trialConvertedAt`, `trialNotificationsSent` — **already migrated** |
| Plan / billing columns | `apps/web/lib/db/schema/auth.ts:30-31` | `isPro`, `plan` (`'free' \| 'trial' \| 'pro' \| 'max'`) |
| Server entitlement resolution | `apps/web/lib/entitlements/server.ts:80-157` | `normalizeBillingPlan()` already returns `trial` while `trialEndsAt > now`, and falls back to `free` once expired (if `isPro` is false) |
| Client nudge-state machine | `apps/web/lib/queries/usePlanGate.ts:160-192` | `trial_honeymoon`, `trial_late`, `trial_last_day`, `recently_lapsed`, `stale_lapsed`, `never_trialed`, `pro_paid`, `max_paid` — the paywall/upgrade UX surface |
| Plan-change (downgrade) | `apps/web/lib/stripe/plan-change.ts:302-522` | Downgrades use a Stripe **subscription schedule** flipped at period end; cancellable via `cancelScheduledPlanChange()` |
| Webhook pipeline | `apps/web/app/api/stripe/webhooks/route.ts` + `apps/web/lib/stripe/webhooks/` | Signature verify, idempotency (`stripe_webhook_events` unique on `stripe_event_id`), event ordering, optimistic locking, audit log |
| Billing sync | `apps/web/lib/stripe/customer-sync/update-status.ts:128-243` | `updateUserBillingStatus()` writes `isPro`, `plan`, Stripe IDs, `billingVersion`, `lastBillingEventAt` |

### What is missing (the actual gaps this spec closes)

1. **No Stripe-native trial.** No `trial_period_days` / `trial_settings` is set on
   checkout or subscription creation (`apps/web/lib/stripe/client.ts`,
   `apps/web/app/api/stripe/checkout/route.ts`). The trial DB columns are only
   ever written by a dev-only endpoint.
2. **Webhooks do not populate trial columns.** A `trialing` subscription status
   currently maps to `isPro=true`/`plan=pro` (`base-handler.ts:104-106,263`),
   never to `plan='trial'`, and never writes `trialStartedAt`/`trialEndsAt`.
3. **No `customer.subscription.trial_will_end` handling** — no pre-paywall nudge.
4. **No reverse-trial entry point** — nothing grants the trial on signup.
5. **No keep-on-downgrade contract.** Downgrade = `isPro=false`; there is no
   defined "what stays vs what locks", and no guarantee that owned data
   (contacts above the free cap, earnings history) is retained rather than
   orphaned or hidden destructively.

---

## Part 1 — Reverse-Trial Mechanism

### Model

```
        SIGNUP                       trial_will_end (T-3d)         TRIAL END (T+14d)
          │                                  │                            │
  ────────┼──────────────────────────────────┼────────────────────────────┼─────────►
          │                                  │                            │
          │   ┌──────────────────────────────────────────────────────┐   │
          │   │            REVERSE TRIAL (full Pro, no card)           │   │
          │   │            plan='trial'  ·  isPro=true                  │   │
          │   └──────────────────────────────────────────────────────┘   │
          ▼                                  ▼                            ▼
   • trialing sub created           • nudge email +              • card on file → plan='pro' (active)
   • plan='trial'                     in-app nudge               • no card      → Stripe cancels →
   • trialStartedAt/EndsAt set        (trial_late)                 plan='free'  (keep-on-downgrade)
```

### Entry: full-feature trial, no card

Create a Stripe subscription on the **Pro monthly price** with a trial and no
upfront payment method:

```ts
// apps/web/lib/stripe/client.ts — subscription/checkout creation
subscription_data: {
  trial_period_days: REVERSE_TRIAL_DAYS,          // 14
  trial_settings: {
    end_behavior: { missing_payment_method: 'cancel' },
  },
  metadata: { clerk_user_id, plan: 'trial' },
},
payment_method_collection: 'if_required',          // no card to start
```

Rationale (per `.claude/rules/infra.md` decision hierarchy — webhook > inline >
lazy > existing cron > new cron): driving the trial through a real Stripe
subscription means **Stripe owns expiry and conversion**, and the existing
hardened webhook handlers do the state transitions. **No new cron, no polling.**

### Entitlement transition

| Phase | Stripe state | `plan` | `isPro` | Entitlements source |
|---|---|---|---|---|
| Trial active | `trialing` | `trial` | `true` | `ENTITLEMENT_REGISTRY.trial` (Pro features, scaled limits) |
| Trial → converted | `active` | `pro` | `true` | `ENTITLEMENT_REGISTRY.pro`; set `trialConvertedAt` |
| Trial → lapsed (no card) | `canceled` (via `missing_payment_method: 'cancel'`) | `free` | `false` | `ENTITLEMENT_REGISTRY.free` (→ keep-on-downgrade) |

The server resolver partly encodes this, but with two gaps that the
implementation **must** close:

- `normalizeBillingPlan()` returns `trial` while `trialEndsAt > now`, and `free`
  once the trial is expired **and** `isPro` is false
  (`apps/web/lib/entitlements/server.ts:99-129`).
- **Read-path gap:** today `trialEndsAt` is read via a cast
  (`server.ts:228-229`) but the billing select never fetches the trial columns
  (`customer-sync/types.ts` `buildSelectObject` / `BILLING_FIELDS_*` have no
  trial fields), so the cast yields `undefined` and the `trial` branch is
  effectively dead. The trial columns must be added to the **read** path, not
  just the write path.
- **Fail-open hazard:** if the `customer.subscription.deleted` webhook is delayed
  or missed, an expired trial row still has `isPro=true, plan='trial'`. The
  resolver then skips the (now-inactive) trial branch, skips the `!isPro` branch,
  and falls through to the mismatch path → returns `plan='pro'` with **full Pro**
  (`server.ts:131-156`). That is fail-**open**. The implementation must harden
  `normalizeBillingPlan` so `rawPlan==='trial' && trialEndsAt <= now` degrades to
  `free` regardless of `isPro`, so entitlements never depend solely on a webhook
  arriving.

The remaining work is to make the **webhooks write the trial columns and the
correct `plan`/`isPro`**, and the **read path fetch them**, so the resolver has
truthful data.

### Trial period

`REVERSE_TRIAL_DAYS = 14`. Single source of truth, co-located with the other
billing constants (`apps/web/lib/stripe/config.ts`). The existing `trial`
registry tagline already reads "14 days of Pro, on us."

### Abuse controls (required — one trial per identity)

The reverse-trial grants full Pro with **no card**, so it is farmable unless
gated. The implementation **must** enforce:

- **Trial-once.** Grant only when the user has never trialed:
  `trialStartedAt IS NULL` (and `trialConvertedAt IS NULL`). The existing
  `activateTrial()` (`apps/web/app/onboarding/actions/activate-trial.ts:38-47`)
  is the live precedent and is **currently broken** — its WHERE clause keys only
  on `clerkId` with no `trialStartedAt IS NULL` guard, so it can silently
  restart/extend a trial. The implementation must fix this and treat the trial
  columns as the trial-once ledger (never cleared on downgrade — see Part 2).
- **Single grant mechanism.** There must be exactly **one** trial-grant path
  (Stripe-native). Do not leave the DB-only `activateTrial` path and the
  Stripe-driven path both live — two grant sources = two sources of truth and a
  guaranteed drift bug.
- **New-account farming posture (product decision, `needs-human-taste`).** A new
  Clerk user + new Stripe customer = a fresh card-less full-Pro trial. The
  implementation issue must pick a posture: (a) email/identity dedupe before
  grant, (b) require a card that is not charged (`payment_method_collection`
  default + `trial_settings`), or (c) accept the risk with monitoring. This is a
  taste/risk call, not an engineering default — flag for human review.

### `plan='trial'` cannot come from the price ID

`getPlanFromPriceId()` (`apps/web/lib/stripe/config.ts:139`) is typed to
`PlanType = 'free' | 'pro' | 'max'` and **cannot** return `'trial'`. A trialing
subscription rides the Pro price, so the webhook must set `plan='trial'` by
branching on `subscription.status === 'trialing'` **independently of** the
price→plan lookup — the price stays Pro, the *plan label* is trial. (Widening
`PlanType` is not required and not recommended; keep trial as a status-derived
label.)

### Nudges (reuse existing client states)

`usePlanGate`'s nudge-state machine already derives the surfaces:
`trial_honeymoon` (early) → `trial_late` (≤3d) → `trial_last_day` (0d) →
`recently_lapsed` (≤30d after) → `stale_lapsed`. Stripe's
`customer.subscription.trial_will_end` (fires ~3 days out) is the durable
trigger for the email nudge; the in-app nudge derives from `trialEndsAt`.

---

## Part 2 — Keep-on-Downgrade Mechanism

When a paid plan ends — paid cancellation **or** a lapsed reverse-trial — the
account degrades to Free **without destroying anything the artist owns**. This is
the "never reject what you can degrade" guardrail made concrete.

### What stays vs what locks

Derived directly from the Free vs Pro entitlement matrix
(`apps/web/lib/entitlements/registry.ts`). "Stays" = already in
`ENTITLEMENT_REGISTRY.free`. "Locks" = Pro-only boolean/limit that flips off.

| Surface | On downgrade | Mechanism |
|---|---|---|
| Public artist profile (`/{username}`) | **Stays** | Free entitlement |
| Smart links (unlimited) + editing | **Stays** | `smartLinksLimit: null`, `canEditSmartLinks: true` on Free |
| Manual releases & release pages | **Stays** | `canCreateManualReleases: true` on Free |
| Basic analytics (30-day window) | **Stays (window shrinks)** | `analyticsRetentionDays: 30`; older data retained but not surfaced, restored on re-upgrade |
| Captured contacts | **Owned data retained; cap re-applies** | Existing rows kept read-only beyond `contactsLimit: 100`; adding new is blocked (already server-gated, `contacts/actions.ts:194-213`). Export lock (`canExportContacts: false`) is **client-only today** and must be enforced server-side — see degrade guarantee below |
| Earnings / tips history | **Retained read-only** | `canAccessTipping: false` stops *new* tips; historical earnings stay visible |
| Fan notifications | **Locks** | `canSendNotifications: false` |
| Pre-save / pre-release pages | **Locks** | `canAccessPreSave: false` |
| Advanced analytics, geo, traffic filtering, ad pixels | **Locks** | corresponding `canAccess*: false` |
| Verified badge | **Locks** | `canBeVerified: false` |
| URL encryption | **Locks** | `canAccessUrlEncryption: false` |
| AI merch creation / retouching | **Locks** | `canAccessMerchCreation`/`canAccessAiRetouching: false` |
| AI assistant | **Throttles** | `aiDailyMessageLimit: 100→10` |

### Hard guarantee: degrade, never delete

Downgrade is a **capability flip, not a data mutation**. The implementation must
not delete or hard-orphan: smart links, releases, captured contacts, earnings
records, or uploaded assets. Locked features hide/disable; they do not purge.

Two invariants the implementation must guarantee:

- **Server-side enforcement, not client-only.** Each lock must be enforced at the
  **server** read/write boundary via `getCurrentUserEntitlements()`, not only in
  `usePlanGate()` UI. Audit at implementation time: contact *export* is gated
  only in the client today (`canExportContacts` lives in `usePlanGate.ts` +
  `types/index.ts`, with no server gate on the export path). Per the Shame-on-Me
  clause, the keep-on-downgrade child issue adds the missing server gate **plus a
  regression test**, not just the UI flag.
- **Trial columns are retained, never cleared on downgrade.** A lapsed user keeps
  `trialStartedAt` / `trialEndsAt` / `trialConvertedAt` so they serve as the
  permanent trial-once ledger (Part 1 abuse controls). `prepareUpdateData`
  (`customer-sync/update-status.ts:51-86`) must not reset them on downgrade.

A re-upgrade restores full access to the retained data with no re-import.

### Reactivation path

`recently_lapsed` / `stale_lapsed` nudge states already exist
(`usePlanGate.ts:175-181`) to drive the "reactivate" CTA. Re-upgrade is the
existing checkout/plan-change flow; because nothing was deleted, the artist's
profile and data come back intact.

---

## Part 3 — Stripe Configuration

### Trial

Canonical entry path is a **Checkout Session** (`mode: 'subscription'`), since
the no-card behavior depends on a Checkout-level param:

- `subscription_data.trial_period_days = REVERSE_TRIAL_DAYS (14)`.
- `subscription_data.trial_settings.end_behavior.missing_payment_method = 'cancel'`
  so a card-less trial cancels at expiry → existing
  `customer.subscription.deleted` handler degrades to Free.
- `payment_method_collection = 'if_required'` — this is a **Checkout Session**
  param (sibling of `subscription_data`, not nested inside it) so the trial
  starts with no card. The direct `stripe.subscriptions.create` path has no
  equivalent param (you instead omit a default payment method); pick the Checkout
  path so the trio above is valid as one call.

### Plan ↔ entitlement mapping

No new price tiers. The reverse-trial subscription rides the **existing Pro
price**; the `trial` *entitlement* is selected by `plan='trial'` while
`status='trialing'`. Mapping stays centralized in
`apps/web/lib/stripe/config.ts` (`getPlanFromPriceId`) and
`apps/web/lib/config/pricing.ts`; entitlements stay derived from
`ENTITLEMENT_REGISTRY` (no duplicated plan matrices, per
`.claude/rules/security.md` → Entitlements single source of truth).

### Webhook events

| Event | Handler today | Change |
|---|---|---|
| `checkout.session.completed` | `checkout-handler.ts` | If session created a trialing sub, write trial columns |
| `customer.subscription.created` | `subscription-handler.ts` / `base-handler.ts` | When `status='trialing'`: set `plan='trial'`, `trialStartedAt`, `trialEndsAt` (from Stripe `trial_start`/`trial_end`) |
| `customer.subscription.updated` | same | On `trialing → active`: `plan='pro'`, set `trialConvertedAt` |
| `customer.subscription.deleted` | same | Degrade → `plan='free'`, `isPro=false`, **apply keep-on-downgrade guarantee** (no data deletion) |
| `customer.subscription.trial_will_end` | **none (new)** | Register a handler → fire pre-paywall nudge email; no plan change |
| `invoice.payment_failed` | `payment-handler.ts` | Unchanged (dunning); lapse to Free still routes through `subscription.deleted` |

All new handling reuses the existing idempotency + event-ordering +
optimistic-locking + audit-log machinery (`stripe_webhook_events`,
`billing_audit_log`, `billingVersion`). No durable state lives in memory
(`.claude/rules/security.md`).

---

## Part 4 — Exact Files To Touch

| File | Change |
|---|---|
| `apps/web/lib/stripe/config.ts` | Add `REVERSE_TRIAL_DAYS` constant; keep `getPlanFromPriceId` authoritative |
| `apps/web/lib/stripe/client.ts` | Add `trial_period_days` + `trial_settings` + `payment_method_collection` to the reverse-trial subscription/checkout creation |
| `apps/web/app/api/stripe/checkout/route.ts` | Plumb the reverse-trial intent into checkout (or a dedicated start-trial entry point) |
| `apps/web/app/onboarding/actions/activate-trial.ts` | Fix the broken trial-once guard (add `trialStartedAt IS NULL`) **or** retire it in favor of the single Stripe-native grant path |
| `apps/web/lib/stripe/webhooks/base-handler.ts` | Map `status='trialing'` → `plan='trial'` (branch on status, **independent** of `getPlanFromPriceId` which can't return `'trial'`); extract `trial_start`/`trial_end` |
| `apps/web/lib/stripe/webhooks/handlers/subscription-handler.ts` | Set trial columns on create; `trialConvertedAt` on convert; keep-on-downgrade on delete |
| `apps/web/lib/stripe/webhooks/types.ts` | Add `customer.subscription.trial_will_end` to `SupportedEventType` union **and** the `isSupportedEventType` runtime guard (route gate drops it otherwise) |
| `apps/web/lib/stripe/webhooks/registry.ts` + new `handlers/trial-handler.ts` | Handle `customer.subscription.trial_will_end` (nudge only, no plan change → replay-safe) |
| `apps/web/lib/stripe/customer-sync/update-status.ts` | Extend the **written** field set to include trial columns; never reset trial columns on downgrade; guarantee downgrade is a capability flip (no destructive writes) |
| `apps/web/lib/stripe/customer-sync/types.ts` | Add trial columns to the **read** path: `BILLING_FIELDS_*`, `buildSelectObject` fieldMap, `UpdateBillingStatusOptions`; widen the `plan` JSDoc to include `'trial'` |
| `apps/web/lib/stripe/customer-sync/queries.ts` | Add trial columns to `UserBillingFields` so `getCurrentUserEntitlements` actually receives `trialEndsAt` (dead today) |
| `apps/web/lib/entitlements/server.ts` | Harden `normalizeBillingPlan`: `rawPlan==='trial' && trialEndsAt <= now` degrades to `free` **regardless of `isPro`** (closes the fail-open gap). No new plan matrix |
| `apps/web/lib/entitlements/registry.ts` | `trial` registry already exists; confirm Free is the degraded target. No new tier |
| Contacts export path (`contacts` actions / export route) | Add **server-side** `canExportContacts` gate + regression test (client-only today) |
| `apps/web/lib/queries/usePlanGate.ts` | Nudge states already exist; wire paywall surfaces to `recently_lapsed` / `stale_lapsed` |
| `apps/web/lib/db/schema/auth.ts` | **No migration needed** — trial columns already present (`:46-50`) |
| `docs/WEBHOOK_MAP.md` | Add `customer.subscription.trial_will_end` to the Stripe row |
| `docs/FEATURE_REGISTRY.md` | Register reverse-trial + keep-on-downgrade flags |

---

## Guardrails & Compliance

- **Entitlements single source of truth** — all gating stays derived from
  `ENTITLEMENT_REGISTRY` via `getCurrentUserEntitlements()` /
  `usePlanGate()`. No duplicated plan matrices (`.claude/rules/security.md`).
- **No new cron / no polling** — Stripe webhooks drive every transition
  (`.claude/rules/infra.md`). Trial expiry and conversion are Stripe-native.
- **Fail-closed billing** — billing outages degrade to Free entitlements; they
  never grant Pro (`entitlements/server.ts` already does this).
- **Degrade, never delete** — keep-on-downgrade is a capability flip; no
  data-deletion job. Re-upgrade restores access to retained data.
- **Cost impact** — zero new recurring cost. No new external API calls, no cron;
  one additional webhook event type on the existing endpoint.
- **Auto-merge** — implementation PRs touch `/api/stripe` and entitlements →
  auto-merge **blocked**, manual review required (`.claude/rules/release.md`).

## Pricing-Philosophy Alignment

- Free-tier-is-a-wedge (Principle 5): keep-on-downgrade keeps the claimed
  profile in the network after a paid plan ends — gravity, not charity.
- Charge for visible value (Principle 4): the locks (notifications, verified
  badge, pre-save, monetization) are audience-visible levers; retained data is
  the artist's, not a paid feature.
- Kill-switch / re-evaluation (Principle 6): reverse-trial length (14d) and
  conversion target are an experiment. Kill-switch band per Principle 5:
  trial→paid conversion **below 2%** at 6 months → trial is too generous, tighten
  it; **above 10%** → leaving demand on the table, test tightening anyway; 2-10%
  is the working range. The implementation issue sets the calendar re-eval date.

---

## Implementation Plan

Per #12147 acceptance, the following child issues are filed **once this spec is
confirmed**. They are sequenced; each is independently shippable behind the
keep-on-downgrade guarantee.

1. **Reverse-trial entry + Stripe trial config + trial-once gate** —
   `trial_period_days`, `trial_settings`, `payment_method_collection`; the
   single Stripe-native start-trial entry point; fix/retire the broken
   `activateTrial` trial-once guard. (`stripe/client.ts`,
   `stripe/checkout/route.ts`, `stripe/config.ts`,
   `onboarding/actions/activate-trial.ts`)
   `needs-human-taste`: the new-account farming posture (dedupe vs. uncharged
   card vs. accept-with-monitoring).
2. **Webhook trial-state sync (read + write) + fail-open hardening** — populate
   `plan='trial'` + trial columns on `trialing`; `trialConvertedAt` on convert;
   add trial columns to the read path; harden `normalizeBillingPlan` so an
   expired trial degrades to free regardless of `isPro`. Includes an
   event-ordering regression test (stale `trialing` update after `deleted` must
   not re-grant Pro). (`base-handler.ts`, `subscription-handler.ts`,
   `customer-sync/{update-status,types,queries}.ts`, `entitlements/server.ts`)
3. **`trial_will_end` nudge handler** — add the event to `SupportedEventType` +
   runtime guard, register the handler, send the pre-paywall nudge.
   (`webhooks/types.ts`, `registry.ts`, new `trial-handler.ts`)
4. **Keep-on-downgrade guarantee + server-side gates + tests** — assert
   downgrade is a capability flip with no data deletion; trial columns retained;
   **add the missing server-side `canExportContacts` gate**;
   contacts/earnings/links retention tests. (`customer-sync/update-status.ts`,
   contacts export path, entitlement gate tests)
5. **Paywall + reactivation UX** — wire `recently_lapsed` / `stale_lapsed`
   surfaces and the reactivate CTA. (`usePlanGate.ts` consumers)
6. **Docs** — `WEBHOOK_MAP.md`, `FEATURE_REGISTRY.md`, `PRICING-STRATEGY.md`.

### Acceptance for this spec

- [x] Reverse-trial mechanism defined (trial period, no-card entry, entitlement
  transition, paywall on lapse).
- [x] Keep-on-downgrade mechanism defined (what stays vs what locks; degrade-not-delete guarantee).
- [x] Stripe config defined (trial settings, plan/entitlement mapping, webhook events).
- [x] Exact files to touch enumerated.
- [ ] Spec confirmed by a human → child implementation issues filed.

## Related

- `apps/web/lib/entitlements/registry.ts` — plan matrix (single source of truth)
- `apps/web/lib/stripe/plan-change.ts` — existing downgrade-at-period-end flow
- `docs/company/PRICING-PHILOSOPHY.md` — pricing decision canon
- `docs/WEBHOOK_MAP.md` — Stripe webhook inventory
- `.claude/rules/infra.md` — webhook-over-cron decision hierarchy
- `.claude/rules/security.md` — entitlements single source of truth, fail-closed
