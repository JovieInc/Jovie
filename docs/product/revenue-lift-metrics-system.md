# Artist Revenue-Lift Metrics System

**Status:** Design + instrumentation roadmap (no instrumentation shipped here).
**Owner:** Product / Growth.
**Source issue:** GitHub #12139.
**Claim this proves:** _"We increase artist revenue through automated opportunity generation and execution."_

This is the single page a VC reads to see the claim is measurable, not aspirational.
Every metric below maps to a real table/column or a labeled proxy with a stated
assumption and a validation path. No vanity metrics, no undefined terms.

---

## 1. North Star — Incremental Revenue per Active Artist (IRPAA)

> The amount of **incremental** artist revenue attributable to **Jovie-shipped
> automations**, averaged across the active-artist cohort, over a rolling 30-day window.

```
IRPAA = Σ(revenue_lift attributable to Jovie automations in window)
        ─────────────────────────────────────────────────────────────
                     active artists in window
```

```
revenue_lift(artist) = direct_gmv_lift          (REAL — Stripe-settled merch)
                     + streaming_value_lift      (PROXY — click→DSP conversion uplift)
                     + fan_capture_ltv_lift       (MIXED — tips REAL, streaming LTV proxy)
```

IRPAA reduces to **revenue-per-artist lift** (lift-first, not a vanity total).
A single number trending up over 30/60/90 days is the proof.

### Attribution spine (what makes "attributable" defensible)

Every lift dollar must trace back to an automation the artist approved:

```
suggested_actions (approved)
  └─ workflow_runs.step_outputs->>'approvalId'   ← unique idx, connectors.ts:547
       └─ workflow_runs.status = 'completed'      ← the automation actually shipped
            └─ downstream revenue event in attribution window
                 (merch_orders | tips | leads.paidAt)
```

If a revenue event cannot be linked through this chain, it does **not** count toward
lift. The spine proves an automation _shipped before_ a revenue event (temporal
ordering), which is the difference between "plausibly Jovie-attributable" and "merely
happened on Jovie." **Causal** lift — ruling out what the artist would have earned
anyway — is established only by the holdout in §4.3, not by linkage alone.

**Headline KPI:** rolling-30-day IRPAA is the single number; the 30/60/90-day series
is the trend backdrop, not three separate KPIs.

---

## 2. Metric tree

| Tier | Metric | Maps to (verified) | Real / Proxy |
|------|--------|--------------------|--------------|
| **A** | **IRPAA** (North Star) | composite of B-tier below | Mixed |
| B | Direct GMV lift | `merch_orders.total_cents` + `stripe_charge_id`, attributed via `merch_card_id` → automation | **Real** |
| B | Tip revenue lift | `tips.amount_cents` (Stripe webhook `/api/webhooks/stripe-tips`) | **Real** |
| B | Outreach→paid conversion [^attr] | `leads.outreach_status` → `signup_at` → `paid_at` / `paid_subscription_id` | **Real** |
| B | Streaming value lift | `click_events` where `link_type = 'listen'` × stated per-stream proxy × Δ conversion | **Proxy** |
| C | Fan-capture rate | `subscribers / unique_users` (already computed, `analytics.ts:302`) | Real (count) |
| C | Audience LTV | tip totals (`tip_audience.tip_amount_total_cents`) + streaming-click weighting | Mixed |
| C | Opportunity cycle time | `suggested_actions.created_at → executed_at` | Real (see §4.2) |
| C | Automation success rate | `workflow_runs.status` distribution by `kind` | Real |
| C | Activation | first published page / first revenue event | Proxy (see §4.4) |

Tier-A/B are **server-side ledgers** and are artist-attributed today (`creator_profile_id`
/ `user_id` on every row). They do **not** depend on the client analytics funnel. Tier-C
client-funnel diagnostics (the _why_ behind lift) depend on the `identify()` gap in §4.1.

[^attr]: Real revenue, but attribution to Jovie outreach (vs. organic signup) assumes
paid conversion within a stated window of the `outreach_status` change. Pin that window
(recommend 14 days) before quoting outreach-driven lift; outside it, count as organic.

---

## 3. What already emits today (grounded)

| Signal | Table / source | File ref |
|--------|----------------|----------|
| Opportunity lifecycle | `suggested_actions` (`status`, `payload`, `user_id`, `agent_run_id`, `created_at`/`approved_at`/`executed_at`) | `schema/connectors.ts:416` |
| Automation execution ledger | `workflow_runs` (`kind`, `status`, `step_outputs`, `approvalId` unique idx) | `schema/connectors.ts:501` |
| Smartlink clicks (link/DSP/geo/UTM) | `click_events` (`link_type`, `is_bot`, `city`/`country`, `metadata`) | `schema/analytics.ts`, `lib/db/queries/analytics.ts` |
| Real merch GMV | `merch_orders.total_cents` + `stripe_charge_id` | `schema/merch.ts:299` |
| Tip revenue + fan capture | `tips` + `tip_audience` (Stripe webhook) | `app/api/webhooks/stripe-tips/route.ts` |
| Outreach funnel | `leads` (`outreach_status`, `signup_at`, `paid_at`) | `schema/leads.ts:130` |
| Dashboard analytics aggregate | one-round-trip CTE (`getUserDashboardAnalytics`) | `lib/db/queries/analytics.ts:62` |
| LLM-level observability | Agnost / OpenTelemetry traces | `lib/observability/agnost.ts` |

---

## 4. Gaps → instrumentation roadmap

> **Two claims in the source epic were stale on inspection and are corrected here.**
> Honesty about current state is the point of a VC-grade metrics page.

### 4.1 Conversion funnel is partially unobservable — narrower than stated. **(#1 blocker)**

The epic says "no GA4/GTM script is mounted." **Corrected:** the `GoogleAnalytics`
component _is_ mounted (`app/layout.tsx:226` → `GoogleAnalytics.tsx`), but it
self-disables internally (`skip` in `GoogleAnalytics.tsx:31`) when
`NEXT_PUBLIC_GA_MEASUREMENT_ID` is absent/invalid or consent is missing — so whether GA
actually loads in prod is an env-config question, not a code question. `track()`
(`lib/analytics.ts:38`, 205 call sites) dispatches to `window.gtag` only when present.

The **real, verifiable** blocker is `identify()` — a confirmed no-op
(`lib/analytics.ts:56`, body is `void userId; void traits;`). Without it, client events
cannot be stitched to a `userId`, so the **client-side** conversion funnel (page-view →
signup → activation) has no per-artist identity. Server-side revenue events are already
artist-attributed, so IRPAA's **revenue** numerator is computable today; only the funnel
_diagnostics_ are blocked.

- **Action:** implement `identify()`.
- **Acceptance 1:** a queryable per-`userId` funnel event in GA4 (or server mirror).
- **Acceptance 2:** confirm GA is actually _firing_ in prod, not merely mounted —
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` present AND `gtag` events landing in GA4. Until this
  passes, the funnel emits nothing even after `identify()` ships.
- Tracks GitHub #8624.

### 4.2 No canonical metrics layer.
Formulas are inline in `lib/db/queries/analytics.ts`. IRPAA needs one module that owns
each definition so the dashboard, exports, and this doc never drift.
- **Acceptance:** a single `metrics` module exporting each Tier-A/B formula. Tracks #12026 / #12027.

### 4.3 No cohort revenue baseline → can't compute lift %.
`revenue_lift` requires a baseline. **Recommended (provable in 30 days):** per-artist
pre-automation run-rate as baseline; `revenue_lift = revenue_in_window − baseline_run_rate`,
counted only when a Jovie automation shipped in the window (§1 spine). Validate against a
not-yet-automated holdout cohort (difference-in-differences).
- **Acceptance:** a stored per-artist baseline row + a holdout cohort flag.

### 4.4 Cycle-time timer — narrower than stated.
The epic says "no detected_at/shipped_at." **Corrected:** `suggested_actions` already has
`created_at`, `approved_at`, `executed_at`, so detect→approve→ship is **partially**
measurable now (`executed_at` ≈ shipped). The genuine gap is a distinct `detected_at`
for the underlying signal (today `created_at` conflates "signal detected" with
"row written").
- **Acceptance:** a `detected_at` column (or source-fact timestamp) separate from `created_at`.

### 4.5 No workflow-level agent result log (success / override / cost-per-opportunity).
LLM-level cost exists via Agnost; the workflow level needs a registry that rolls
`workflow_runs` up to success/override/cost per opportunity. Tracks #10367.

### 4.6 No manual-vs-automated task classification.
Needed to attribute lift to _automation_ specifically. Add a classifier flag on
`workflow_runs` / `suggested_actions`.

### 4.7 Asset landing-page analytics not built.
Per-asset distribution events missing. Tracks #10804.

---

## 5. Proxy assumptions & 30-day validation path

Where true DSP/royalty data is unavailable, `streaming_value_lift` uses a **labeled
proxy**, never presented as settled revenue:

- **Assumption:** a listen-click converts to a stream at a stated rate `r`, valued at a
  stated per-stream constant `v`. Both `r` and `v` are config, surfaced in the doc/UI,
  never hardcoded as fact.
- **Lift, not level:** only the _delta_ in listen-click conversion vs the artist's
  pre-automation baseline counts. A wrong absolute `v` cancels out of a lift ratio.
- **Validation (30 days):** compare the automated cohort's measured GMV+tip lift (real)
  against the proxy's predicted streaming lift. This validates **directional correlation
  only** — that streaming lift moves _with_ real revenue lift — not the absolute calibration
  of `v`; the two revenue types can genuinely decouple (a listen-click bump need not track
  a merch bump). If the proxy systematically over/under-shoots, recalibrate `r`/`v` or drop
  the term. The real components (GMV, tips, paid conversions) anchor the number; the proxy
  is the only soft input and it is bounded.
- **Statistical power:** the DiD holdout needs a stated minimum cohort size per side, or
  a 30-day "trending up" reads as noise. Pin that minimum before quoting a lift %.

---

## 6. Governance

- Mechanical state changes live in the tracker; strategic rationale stays in chat/gbrain.
- No competitor brand names. No banned jargon.
- Proxy inputs are always labeled "proxy" with the assumption stated inline — a reader can
  never mistake a modeled number for settled revenue.

## 7. Scope

This page is the metrics **design + roadmap**. It does **not** implement instrumentation —
each gap in §4 routes to an existing child issue whose acceptance is a queryable system
event. Implementation is sequenced 30/60/90 days against those issues.
