# Billing Spec — Reverse-Trial + Keep-on-Downgrade

Code-grounded specification for two deliberate billing mechanics. Tracks
[GitHub #12147](https://github.com/JovieInc/Jovie/issues/12147).

> **Status: SPEC ONLY.** No code, flag, paywall, or migration ships from this
> document or its PR. Implementation is split into child issues (see
> [§7](#7-implementation-issues-to-file-after-confirmation)) and filed **after a
> human confirms this spec**. Implementation touches auth/payment paths and must
> go through the high-risk CI gates (smoke + preview + Migration Guard) per
> [`.claude/rules/release.md`](../.claude/rules/release.md) — it is **not**
> auto-merge-eligible.

Related canon: [`PRICING-PHILOSOPHY.md`](company/PRICING-PHILOSOPHY.md) (Principle
5 — free is a wedge, never a churn-retention tool), the entitlements
single-source-of-truth and durable-webhook-coordination rules in
[`.claude/rules/security.md`](../.claude/rules/security.md), and the cron/webhook
decision hierarchy in [`.claude/rules/infra.md`](../.claude/rules/infra.md).

---

## 1. Definitions

| Term | Meaning |
|---|---|
| **Reverse-trial** | A new user gets **full Pro-level features for a fixed window**, then the window ends **into a paywall** (locked Pro features + free entitlements), not silently into a degraded free tier. The opposite of the classic "free, upgrade for Pro" funnel: start premium, fall back to free. |
| **Keep-on-downgrade** | When a paid plan (or trial) ends, the user **keeps everything that is theirs and degrade-able** (public profile, smart links, owned contacts/data) and **loses only the leverage features** (notifications, advanced analytics, tipping, exports). Guardrail: "never reject what you can degrade." We never delete owned data on downgrade; we lock writes and hide premium surfaces. |

Both mechanics already have **partial scaffolding** in the codebase. This spec
documents what exists, what's missing (including one production bug — **G0**), and
the exact transitions to implement.

---

## 2. Current state (what already exists)

### 2.1 The `trial` plan

`apps/web/lib/entitlements/registry.ts`:

- `PlanId = 'free' | 'trial' | 'pro' | 'max'`.
- `ENTITLEMENT_REGISTRY.trial` grants the full `PRO_BOOLEANS` set, with **capped
  limits**: `analyticsRetentionDays: 180`, `contactsLimit: 250`,
  `aiDailyMessageLimit: 25`, `aiPitchGenPerRelease: 3`, `aiRetouchDailyLimit: 10`,
  `chatFileUploadLimit: 15`.
- Marketing: `displayName: 'Pro Trial'`, `tagline: '14 days of Pro, on us.'`.
- `TRIAL_NOTIFICATION_RECIPIENT_LIMIT = 50` — total fan-notification recipients
  allowed during the trial.
- `getEntitlements('trial')` → the trial block; `isProPlan('trial')` → `true`.

### 2.2 Trial DB columns (already migrated)

`apps/web/lib/db/schema/auth.ts` → `users` table, `// Reverse trial tracking`:

```ts
trialStartedAt:        timestamp('trial_started_at'),
trialEndsAt:           timestamp('trial_ends_at'),
trialConvertedAt:      timestamp('trial_converted_at'),
trialNotificationsSent: integer('trial_notifications_sent').default(0),
```

Also on the row: `isPro`, `plan` (`text default 'free'`), `stripeCustomerId`,
`stripeSubscriptionId`, `stripePriceId`, `billingVersion`.

### 2.3 Trial activation (entry point exists)

`apps/web/app/onboarding/actions/activate-trial.ts` → `activateTrial(clerkId)`:
sets `plan: 'trial'`, `trialStartedAt: now`, `trialEndsAt: now + 14d`
(`TRIAL_DURATION_DAYS = 14`), `trialNotificationsSent: 0`.

### 2.4 Trial → entitlement resolution (read path — partially BROKEN, see G0)

`apps/web/lib/entitlements/server.ts` → `normalizeBillingPlan()` *intends* to:

- If `rawPlan === 'trial'` and `trialEndsAt > now` → plan `'trial'`,
  `isTrialing: true`, `trialDaysRemaining`. Entitlements resolve to the trial block.
- If the trial expired → fall through; if `isPro` is false → `'free'`.

**But it never sees `trialEndsAt` in production (G0).** `getCurrentUserEntitlements`
reads `(billing.data as Record<string, unknown>).trialEndsAt` (server.ts:228),
and `billing` comes from `getUserBillingInfo()`, which selects
`BILLING_FIELDS_FULL` — a list that has **no trial columns** (and
`buildSelectObject`'s `fieldMap` has none either). So `rawTrialEndsAt` is always
`undefined`, the trial branch never fires, and a `plan='trial'` row (with
`isPro=false`) resolves straight to **free** server-side regardless of date. The
existing test `tests/unit/lib/entitlements.server.test.ts` passes only because it
**mocks** `getUserBillingInfo` to return `trialEndsAt`, which the real function
cannot. Green test, wrong production behavior. See [§3 G0](#g0--load-bearing-the-server-entitlement-read-never-sees-trial-columns).

The **client** path is correct and disagrees with the server: `usePlanGate` →
`/api/billing/status/route.ts` (`readTrialFields`) queries `users.trialEndsAt`
directly, and `usePlanGate` already derives a `NudgeState` (`active_trial`,
`recently_lapsed`, `stale_lapsed`) from `plan`/`trialEndsAt`.

### 2.5 Downgrade plumbing (Stripe side exists)

- `apps/web/lib/stripe/plan-change.ts` — `executePlanChange()` does tier/interval
  downgrades via a **subscription schedule** that flips price at period end
  (`end_behavior: 'release'`), cancellable via `cancelScheduledPlanChange()`
  (schedule `release`, not `cancel`). `PLAN_HIERARCHY = { free:0, pro:1, max:2 }`.
- `apps/web/lib/stripe/webhooks/handlers/subscription-handler.ts` +
  `base-handler.ts` → `processSubscription()`:
  - `isActiveSubscription(status)` = `status === 'active' || 'trialing'`
    (`webhooks/utils.ts`).
  - active → `getPlanFromPriceId(priceId)` → `updateUserBillingStatus({ isPro:true, plan, … })`.
  - inactive → `updateUserBillingStatus({ isPro:false, eventType:'subscription_downgraded' | … })`
    (no explicit `plan` arg; `effectivePlan = plan ?? (isPro ? 'pro' : 'free')`
    resolves to `'free'`).
  - `customer.subscription.deleted` → `isPro:false`, `stripeSubscriptionId:null`,
    `eventType:'subscription_deleted'`; fail-closed (throws + `captureCriticalError`
    if the downgrade write fails). Note: `.deleted` nulls `stripeSubscriptionId`
    but **keeps** `stripeCustomerId`.
- Webhooks are idempotent (dedupe by `stripeEventId`) and optimistic-locked
  (`billingVersion`), with a `billingAuditLog` row per transition
  (`update-status.ts`).

---

## 3. Gaps (what this spec adds)

### G0 — LOAD-BEARING: the server entitlement read never sees trial columns

`getUserBillingInfo()` selects `BILLING_FIELDS_FULL` (`customer-sync/types.ts`),
which omits `trialStartedAt`/`trialEndsAt`/`trialConvertedAt`, and
`buildSelectObject`'s `fieldMap` doesn't map them. So `normalizeBillingPlan`'s
trial branch is **dead in production** (§2.4). Consequences:

1. Server-side, a trialing user gets **free** entitlements today (not the
   Pro-capped trial block). `isTrialing`/`trialDaysRemaining` are never populated
   server-side, so any server surface that needs them (paywall, gating) has no
   signal. Client and server disagree.
2. **Every other gap below depends on fixing G0 first.** The lazy expiry flip
   (G1) and conversion stamping (G3) both need the trial columns on the read path.
3. **Security: fixing G0 is itself the moment a latent escalation appears.** Once
   the columns are selected, active `plan='trial'` rows start resolving to
   Pro-capped entitlements they do **not** get today. Therefore the column wiring
   **and** the active-trial + expiry entitlement tests must land in the **same
   PR** — never wire the columns without the gate test.
4. **Shame-on-Me guardrail gap:** the green-but-wrong test (`getUserBillingInfo`
   mocked to return a field it can't return) is exactly the prevention gap the
   code-style rule targets. The G0 fix PR must replace that mock with the real
   field set so the test fails on the dead path and passes after wiring.

### G1 — Reverse-trial end is passive, not a paywall event

After G0, `trialEndsAt` expiry degrades entitlements on the **next read**, but
nothing:

1. Rewrites `plan: 'trial' → 'free'` (it stays `'trial'` until another write
   touches the row), leaving a stale `plan` that downstream raw-plan readers
   (e.g. fan-notification eligibility) can misread.
2. Surfaces a deliberate **paywall / "trial ended" state** at expiry.

The trial is a **DB-granted window, not a Stripe `trialing` subscription** — so
Stripe's `trial_will_end`/trialing events do **not** fire for it. Expiry is driven
by our own clock.

### G2 — `activateTrial` is not idempotent / not guarded

The action's doc comment claims "only activates for free users who haven't trialed
before," but the query is unguarded:

```ts
.update(users).set({ plan: 'trial', trialStartedAt: now, … })
.where(eq(users.clerkId, clerkId))   // no plan / prior-trial guard
```

A second call **re-grants** a trial to a paid user (clobbering `plan`) or
**re-starts** an expired trial. The comment lying about a guard is itself a bug.

### G3 — Keep-on-downgrade is implicit; `trialConvertedAt` is never written

- Downgrade drops the user to `plan:'free'`, `isPro:false`. The free entitlement
  block **already keeps** the right things and **locks** the right things — but
  there is **no documented keep-vs-lock contract** a test can enforce, so a future
  registry edit could silently turn a "keep" into a "delete."
- Over-cap owned data (a trial user's 250 contacts vs free's 100) has no defined
  retention rule.
- `trialConvertedAt` has **no writer** — the conversion-tracking column is dead.

---

## 4. Reverse-trial mechanism (spec)

### 4.1 Lifecycle

```text
onboarding done ──activateTrial()──▶ plan='trial', trialStartedAt, trialEndsAt(+14d)
                                          │
   (after G0, reads resolve to trial/Pro-capped entitlements while now < trialEndsAt)
                                          │
        ┌─────────────────────────────────┴───────────────────────────────┐
        ▼ user upgrades (Stripe checkout)                                   ▼ trialEndsAt reached, no checkout
   subscription.created/updated → active                              TRIAL EXPIRY (our clock)
   → isPro=true, plan=pro|max                                         → entitlements resolve to free (gate)
   → stamp trialConvertedAt (if currently null)                       → best-effort flip plan 'trial'→'free'
                                                                      → client nudgeState = recently/stale_lapsed
                                                                        renders "trial ended" paywall
```

### 4.2 Trial period

- **14 days** (`TRIAL_DURATION_DAYS`, single constant). If we ever A/B the length,
  gate it behind a flag with a kill-date per PRICING-PHILOSOPHY Principle 6. Out of
  scope here.

### 4.3 Entitlement transition (trial → free)

**The gate, not the flip, is the source of truth.** Entitlement resolution for
`plan='trial'` is gated on `trialEndsAt > now` **at read time** (server.ts:101,
after G0). An expired trial resolves to free even if the DB `plan` still says
`'trial'`. This is the security invariant: a lagging or failed `plan` flip can
**never** grant Pro after expiry. The flip is cosmetic + audit, not a gate.

- **Read-side gate:** requires G0 (thread `trialEndsAt` onto the read path). No
  registry change; the `trialEndsAt > now` check is the gate.
- **DB flip (G1.1) — lazy, no new cron, audited, fail-closed:** when a deliberate
  choke point resolves a row with `plan==='trial' && trialEndsAt <= now`, perform a
  single **idempotent** flip **through `updateUserBillingStatus(...)`** so it
  inherits `billingVersion` optimistic locking + a `billingAuditLog` row + the
  existing fail-closed semantics:
  - `updateUserBillingStatus({ clerkUserId, isPro:false, plan:'free', eventType:'trial_expired', source:'manual', metadata:{ trialEndsAt } })`,
    then `invalidateBillingCache(userId)`.
  - Requires adding `'trial_expired'` to `BillingAuditEventType`
    (`customer-sync/types.ts`).
  - **Choke point, NOT the hot resolver.** Do **not** inline a `db.update` inside
    `getCurrentUserEntitlements` (a hot, Redis-cached, per-request read that "never
    throws"). Put the flip in a small `resolveTrialExpiry(clerkUserId)` helper
    invoked from the billing-status route (the one place trial state is already
    read). The flip is **best-effort**: if it fails, swallow it — the read already
    returns free, so failing the write is fail-closed-safe and never escalates.
  - *ponytail:* the read already computes "expired"; the flip just keeps the DB
    tidy and audited. A user who never logs back in keeps a stale `plan='trial'`
    row — acceptable **because** the entitlement gate (and fan-notification
    eligibility, §4.6) is driven by resolved entitlements, not raw `plan`. A
    dormant-cleanup cron step is a **Candidate follow-up** (§7), not pre-built.
- **Paywall state (G1.2) — reuse existing client signal, no new field.**
  `usePlanGate` already derives `NudgeState` `recently_lapsed`/`stale_lapsed` from
  `plan==='free' && trialEndsAt` within/after 30 days. Render the "Your Pro trial
  ended — upgrade to keep notifications & analytics" prompt off the **existing
  `nudgeState`**. Do **not** add a redundant `trialExpired` boolean to
  `UserEntitlements` (two sources of truth for "trial ended"). The prompt is a UI
  gate; it must not block kept features (§5) or shift layout
  (`.claude/rules/ui.md`).

### 4.4 Conversion stamping (G3)

When a webhook flips a trial user to a paid active subscription
(`processSubscription` active branch), stamp `trialConvertedAt`:

- Compute the stamp **inside `update-status.ts`** off the **freshly-read**
  `currentUser.plan` (the optimistic-lock path already re-reads on conflict via
  `retryUpdateWithFreshData` — the stamp decision must use the fresh read, not the
  first read, to avoid a double/missed stamp under concurrent events).
- **Idempotent:** only set when `trialConvertedAt IS NULL` and the prior plan was
  `'trial'`. Requires adding `trialConvertedAt` to `BILLING_FIELDS_STATUS` (so the
  "already stamped?" check is possible) and to `prepareUpdateData`.
- Analytics only — never an entitlement. Powers trial→paid conversion-band
  tracking (PRICING-PHILOSOPHY Principle 5). Conversions via non-webhook paths
  (e.g. manual admin grant flipping `isPro`) won't stamp — note this so the metric
  isn't trusted as complete.

### 4.5 Re-activation guard (G2)

`activateTrial` WHERE must become:

```ts
.where(and(
  eq(users.clerkId, clerkId),
  eq(users.plan, 'free'),          // not paid, not already trialing
  isNull(users.trialStartedAt),    // never trialed before (one trial per users-row)
))
```

Return `false` (skipped) when 0 rows update (`.returning(...)` already present).

**Anti-farming invariant (security):** the `IS NULL` clause is the lock. It holds
**only if no downgrade or expiry writer ever clears `trialStartedAt`/
`trialConvertedAt`.** Today nothing does, and the §4.3 flip must preserve them.
This is added to the no-DELETE invariant (§5.1).

**Residual risk — delete+recreate:** the guard is per-`users`-row, i.e. "one trial
per account," not per human. A user who deletes and recreates their Clerk identity
gets a fresh row and can re-trial. Accepted blast radius: the trial's
abuse-valuable surface (outbound fan email) is bounded by
`TRIAL_NOTIFICATION_RECIPIENT_LIMIT = 50`. A durable re-trial gate (keyed on
email/`stripeCustomerId` history that survives account deletion) is a **Candidate
follow-up** (§7), not shipped here.

### 4.6 Fan-notification eligibility must read entitlements, not raw plan

`apps/web/lib/notifications/release-eligibility.ts` gates fan notifications on
`isTrialing` + the 50-recipient cap. A stale `plan='trial'` row (dormant expired
user, §4.3) must **not** keep sending. Confirm/assert that eligibility is driven by
**resolved entitlements** (post-expiry `canSendNotifications=false`,
`isTrialing=false`), not by raw `plan==='trial'`. Covered by a test in §7.

---

## 5. Keep-on-downgrade mechanism (spec)

Triggered on: trial expiry (§4), `subscription.deleted`, and downgrade to a lower
paid tier. The contract: **derive enforcement from the existing entitlement
registry**, then lock it with a regression test. No new entitlement booleans.

### 5.1 The invariant (the real deliverable)

Every entitlement surface on downgrade is exactly one of:

- **KEEP** — free tier still grants it (e.g. `canEditSmartLinks:true`, public
  profile, `canCreateManualReleases:true`, `aiCanUseTools:true`, basic 30-day
  analytics).
- **LOCK** — free denies the action but **retains the data** (e.g.
  `canSendNotifications`, `canExportContacts`, `canAccessTipping`,
  `canAccessAdvancedAnalytics`, `canAccessPreSave`, `canAccessFutureReleases`,
  `canBeVerified`, `canAccessUrlEncryption`, `canAccessInbox`,
  `canGenerateAlbumArt`, `canAccessMerchCreation`, `canAccessAiRetouching`, and
  all Max-only booleans: `canAccessStripeConnect`, `canAccessFanSubscriptions`,
  `canAccessEmailCampaigns`, `canAccessApiKeys`, `canAccessTeamManagement`,
  `canAccessWebhooks`, `canAccessWhiteLabel`, `canAccessAbTesting`).
- **DEGRADE** — lower quota, **retain history** (`aiDailyMessageLimit` 25/500→10,
  `aiPitchGenPerRelease`→1, `analyticsRetentionDays`→30, `chatFileUploadLimit`
  15→5, `contactsLimit`→100 with §5.2 retention).

**No surface is DELETE. No downgrade or expiry writer clears owned-content rows,
trial-history columns (`trialStartedAt`/`trialConvertedAt`), or `stripeCustomerId`.**
A "LOCK" that deletes data, or a flip that clears trial history (reopening
farming), is a bug.

**Test it against the registry, not a hand-list.** The regression test asserts each
downgrade path resolves to its registry block — `max → pro` resolves to
`ENTITLEMENT_REGISTRY.pro`, and `pro|trial → free` (and `max → free` on full
cancellation) resolves to `ENTITLEMENT_REGISTRY.free` — every boolean + limit. This
covers tier downgrades, not just the drop to free, so the matrix can never drift
from the registry (single-source-of-truth respecting). The prose above is the
human-readable view of the `→ free` floor; the registry is the truth for every
target tier.

### 5.2 Over-cap data retention

- Contacts: a user above the free cap (trial 250 / unlimited → free 100) **keeps
  all existing rows**. Enforcement is on the **contact-capture write path only**
  (it already rejects new captures at `count >= contactsLimit` and never prunes —
  confirm in the contacts capture action). Downgrade never retroactively deletes.
- No other free limit is lower than a paid limit in a way that risks data
  (`smartLinksLimit` is `null`/unlimited on every tier).

### 5.3 Where it's enforced + the audit

Already centralized: all gates call `getCurrentUserEntitlements()` →
`ENTITLEMENT_REGISTRY[plan]`. Implementation work:

1. The §5.1 **registry-equality regression test** + an explicit no-DELETE /
   no-clear-trial-history assertion.
2. An **audit**: grep downgrade/deletion handlers (`subscription_deleted`,
   `subscription_downgraded`, the §4.3 flip) for any `delete(`/destructive write to
   owned tables (contacts, links, profiles) or any clearing of `trialStartedAt`/
   `trialConvertedAt`/`stripeCustomerId`. There should be none. Note: the over-cap
   *write rejection* lives in the contact-capture path, not the downgrade path — so
   that path is included in the test scope, not just the downgrade handlers.

---

## 6. Stripe config + exact files to touch

The trial is a **DB grant, not a Stripe trial period** — so **no Stripe
Price/trial-config change is required**. (A future card-on-file Stripe-native trial
— `subscription.create` with `trial_period_days`, handle
`customer.subscription.trial_will_end` — is a separate spec; **Candidate
follow-up**.)

| File | Change | Gap |
|---|---|---|
| `apps/web/lib/stripe/customer-sync/types.ts` | Add `trialStartedAt`/`trialEndsAt`/`trialConvertedAt` to `UserBillingFieldKey`, `BILLING_FIELDS_FULL`, `buildSelectObject.fieldMap`; add `trialConvertedAt` to `BILLING_FIELDS_STATUS`; add `trialConvertedAt?: Date` to `UpdateBillingStatusOptions`; add `'trial_expired'` to `BillingAuditEventType` | **G0**, G1.1, G3 |
| `apps/web/lib/stripe/customer-sync/billing-info.ts` | `getUserBillingInfo` return shape carries the trial columns | **G0** |
| `apps/web/lib/entitlements/server.ts` | Remove the unsafe `as Record<string,unknown>` cast once columns are typed; confirm the `trialEndsAt > now` gate fires | **G0** |
| `apps/web/tests/unit/lib/entitlements.server.test.ts` | Replace the `getUserBillingInfo` mock that returns an unselectable field; add active-trial + expired-trial (DB plan still `'trial'`, `trialEndsAt` past → resolves free) assertions | **G0** gate test |
| `apps/web/app/api/billing/status/route.ts` (or a `resolveTrialExpiry` helper) | Invoke the best-effort, audited lazy flip when `plan==='trial' && trialEndsAt<=now` | G1.1 |
| `apps/web/lib/stripe/customer-sync/update-status.ts` | Persist `trialConvertedAt` idempotently off the fresh-read `currentUser.plan==='trial'`; support `'trial_expired'` event; never clear trial-history columns | G1.1, G3 |
| `apps/web/app/onboarding/actions/activate-trial.ts` | Guarded WHERE (§4.5); fix the lying doc comment | G2 |
| `apps/web/lib/queries/usePlanGate.ts` + paywall UI (`SidebarUpgradeBanner` / dashboard) | Render "trial ended" prompt off the **existing** `nudgeState` (`recently_lapsed`/`stale_lapsed`); no new flag; layout-shift-safe | G1.2 |
| `apps/web/lib/entitlements/registry.ts` | **No new entitlements.** (The §5.1 test reads `ENTITLEMENT_REGISTRY.free` directly.) | — |
| Tests | §5.1 registry-equality + no-DELETE/no-clear matrix; §4.6 eligibility-by-entitlement; trial-expiry transition; `activateTrial` guard; over-cap contact retention | both |

Webhook events handled today are sufficient: `customer.subscription.created` /
`.updated` (conversion stamping + tier downgrade) and `.deleted` (full downgrade).
**No new webhook subscription required.** All new writes route through
`updateUserBillingStatus` to inherit `stripeEventId`/`billingVersion` dedupe +
audit; **no in-memory coordination** is introduced
([`.claude/rules/security.md`](../.claude/rules/security.md)).

---

## 7. Implementation issues to file (after confirmation)

Filed as **child issues once a human confirms this spec** (gated — confirmation may
reshape scope). Suggested split (each ≤ size cap, each one PR):

0. **G0 — thread trial columns through the billing read path** (`types.ts`,
   `billing-info.ts`, `server.ts`, server entitlement tests). **Base issue;**
   #1/#2/#3 are `blockedBy` this. Ships the column wiring **and** the active/expiry
   gate tests together (escalation guard, §3 G0.3).
1. **Reverse-trial expiry transition** (G1.1): best-effort audited
   `plan:'trial'→'free'` flip via `updateUserBillingStatus` + `'trial_expired'`
   event + cache invalidation + tests. *blockedBy #0.*
2. **Trial-ended paywall UI** (G1.2): prompt off existing `nudgeState`;
   layout-shift-safe. *blockedBy #0.*
3. **Trial conversion stamping** (G3): idempotent `trialConvertedAt` write +
   `BILLING_FIELDS_STATUS` + webhook detection + tests. *blockedBy #0.*
4. **`activateTrial` re-activation guard** (G2): guarded WHERE + doc-comment fix +
   idempotency test. *Independent; smallest; can ship first.*
5. **Keep-on-downgrade contract test** (G3): §5.1 registry-equality + no-DELETE /
   no-clear-trial-history matrix + over-cap contact retention test + destructive-
   write audit. *Independent.*
6. **Candidate follow-ups:** dormant-expired-trial cleanup cron step (only if a
   lifecycle-email need appears); durable per-human re-trial gate (delete+recreate
   farming); Stripe-native card-on-file trial.

Each child carries the high-risk billing label set (smoke + preview gates), links
back to #12147, and follows [`.claude/rules/release.md`](../.claude/rules/release.md).
Do **not** add `automerge`.

---

## 8. Acceptance (this spec issue)

- [x] Code-grounded spec attached (this file + posted as #12147 comment).
- [x] Reverse-trial mechanism defined (period, entitlement transition, paywall),
      including the production-bug gap **G0** the read path depends on.
- [x] Keep-on-downgrade contract defined (KEEP/LOCK/DEGRADE, no-DELETE +
      no-clear-trial-history invariant, registry-equality test).
- [x] Stripe config + exact files-to-touch enumerated; security review folded in
      (fail-closed lazy flip, anti-farming invariant, durable coordination).
- [ ] **Human confirms spec** → child implementation issues (§7) filed.
