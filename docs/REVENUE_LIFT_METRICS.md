# Artist Revenue-Lift Metrics System

Canonical design + instrumentation roadmap for proving Jovie's core claim:
**we increase artist revenue through automated opportunity generation and execution.**

This is the metrics **design** (North Star, event-to-metric map, gap roadmap). It does
not ship the instrumentation — each residual gap below is a child issue whose acceptance
is a queryable system event, routed to the issue runner. Every metric here maps to a real
table, column, or emitter that exists today; where true royalty/DSP revenue is
unavailable, a labeled proxy with stated assumptions and a validation path is used instead
of an unverifiable number.

Source epic: JovieInc/Jovie#12139.

## North Star (Tier A) — IRPAA

**Incremental Revenue per Active Artist** = incremental artist revenue attributable to
Jovie-shipped automations, averaged across the active-artist cohort over a rolling 30-day
window.

```text
IRPAA = Σ(revenue_lift from Jovie-shipped automations in window) / active_artists_in_window

revenue_lift = gmv_delta
             + (streaming_value_weight × dsp_click_delta)
             + (fan_capture_ltv_weight × new_fans_delta)
```

`revenue_lift` is **already computed per automation** and persisted — `gmv_delta`,
`dsp_click_delta`, and `new_fans_delta` are raw columns on `workflow_run_outcomes`
(see map below). The two `_weight` coefficients (dollarizing clicks and captured fans) and
the `active_artists_in_window` denominator are the parts that do **not** exist yet — see
Residual Gaps.

## What emits today (grounded)

Every row cites the file that owns the data. `revenue_lift` is not a future aggregate —
its three terms are durable columns written when a `release_to_revenue` workflow completes.

| Metric term | Source of truth (file) | Table / column |
|---|---|---|
| Per-automation `revenue_lift` row | `apps/web/lib/connectors/workflows/outcome-attribution.ts` (`recordWorkflowRunOutcome`) | `workflow_run_outcomes` (`apps/web/lib/db/schema/connectors.ts:569`) — one row per completed run, unique on `workflow_run_id` |
| `gmv_delta` (real revenue) | `apps/web/lib/release-to-revenue/gmv-attribution.ts` (`buildReleaseGmvRowForRun`) ← Printful order value | `workflow_run_outcomes.gmv_delta_cents`; summed from paid `merch_orders.subtotal_cents` (`apps/web/lib/db/schema/merch.ts`) |
| `dsp_click_delta` / `click_delta` | `outcome-attribution.ts` (`countReleaseClicks`, `listenOnly`) over the run's attribution window | `workflow_run_outcomes.dsp_click_delta`, `.click_delta`; from `click_events` (`apps/web/lib/db/schema/analytics.ts:283`) |
| `new_fans_delta` (fan capture) | `outcome-attribution.ts` (`countCapturedFansInWindow`) — audience members with email/phone first seen in window | `workflow_run_outcomes.new_fans_delta`; from `audience_members.first_seen_at` |
| Per-artist lift sum (raw) | `outcome-attribution.ts` (`sumArtistAutomationAttributedRevenue`) | sums the four deltas for one `user_id` over a window — **no weighting, no cohort average** |
| Opportunity lifecycle | `apps/web/components/features/opportunity-inbox/OpportunityInboxPageClient.tsx`; detectors in `apps/web/lib/connectors/enrichment/suggestions.ts` | `suggested_actions` (`connectors.ts:416`) — `status`, `payload`, `user_id`, `created_at`, `approved_at`, `executed_at` |
| Automation execution ledger | cron CAS lease (`status`/`run_at`/`claimed_at`/`lease_expires_at`) | `workflow_runs` (`connectors.ts:501`); for `execute_approved_action` runs a partial unique index on `step_outputs ->> 'approvalId'` links a run to its approved opportunity (`connectors.ts:547`) |
| Smartlink clicks (per link/DSP/geo/UTM) | dashboard analytics in `apps/web/lib/db/queries/analytics.ts` | `click_events` — `link_id`, `link_type`, `country`, `city`, `metadata` (DSP/UTM) |
| Tip → fan capture | `apps/web/app/api/webhooks/stripe-tips/route.ts` → `apps/web/lib/services/tips/process-tip-completed.ts` | `tip_audience` (`apps/web/lib/db/schema/tip-audience.ts`) — `tip_amount_total_cents`, dedup on email + profile |
| Outreach funnel (outreach→claim→signup→paid) | `apps/web/lib/db/schema/leads.ts:54` | `leads` — `outreach_status`, `claim_token`, `signup_at`, `paid_at`, `attribution_status` |
| Activation | publish timestamp | `merch_cards.published_at` / `playlists.published_at` |
| Client funnel events | `apps/web/lib/analytics.ts` (`track`) → `gtag`; GA4 mounted by `apps/web/components/providers/GoogleAnalytics.tsx` (gated by `NEXT_PUBLIC_GA_MEASUREMENT_ID` + consent via `shouldMountGoogleAnalytics`) | ~200 `track(` call sites → GA4. **Not** a queryable warehouse; `identify()` is a no-op (`analytics.ts:56`) |
| LLM cost/latency per user+session | `apps/web/lib/observability/agnost.ts` (OTEL → Agnost), booted in `apps/web/instrumentation.ts` | spans only; no per-workflow result row |

## Residual gaps → child issues

Acceptance for each is **a queryable system event/column**, not a dashboard. Classification
follows `.claude/rules/linear.md` (Required = needed to compute IRPAA; Candidate = pickup
agent judges first). File these on the `Jovie` team referencing this doc; do not add the
`automated` label.

| # | Gap | Acceptance (queryable event) | Class |
|---|---|---|---|
| 1 | **SHIPPED (gh-12141).** Weights live in `apps/web/lib/metrics/revenue-lift-weights.ts` (versioned, cited assumptions, `lastValidatedAt`, unit-tested); `dollarizeRevenueLiftCents` dollarizes any outcome row. | A single constants module exporting both weights with cited assumptions + a unit test; a query returns dollarized `revenue_lift` per run. | Required |
| 2 | **SHIPPED (gh-12141).** `artist_revenue_cohorts` table (`apps/web/lib/db/schema/revenue-cohorts.ts`) tags `jovie_active`/`control` per artist with an immutable 30-day pre-activation baseline; `listArtistCohortRevenueRows` (`apps/web/lib/metrics/artist-revenue-cohorts.ts`) emits per-artist cohort tag + rolling revenue signal + lift for any window. jovie_active auto-assigns on first recorded automation outcome. | A query/view returning `active_artists_in_window` and a pre-automation revenue baseline per artist so IRPAA and lift % are computable. | Required |
| 3 | **SHIPPED (gh-12141).** `getIRPAA(window)` / `getRolling30DayIRPAA` (`apps/web/lib/metrics/irpaa.ts`) join the weights + active-artist denominator over `workflow_run_outcomes`, deterministic tests included; every result embeds the weights snapshot. | A `getIRPAA(window)` query joining gaps 1+2 over `workflow_run_outcomes`, with a deterministic test. | Required |
| 4 | **PARTIAL (gh-12141).** The documented fan-capture LTV weight now feeds gap 1 (`FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN`), and baselines store realized tips + GMV separately for validation queries. Remaining: the recurring 30-day proxy-vs-realized validation pass that recalibrates the weight and stamps `lastValidatedAt`. | A documented fan-capture LTV proxy (weight feeding gap 1) with a 30-day validation column comparing proxy vs. realized GMV/tips. | Required |
| 5 | **`identify()` is a no-op** → client funnel can't stitch a user across sessions; GA4 is a sink, not queryable for IRPAA. | Either wire `identify()` to a durable server-side funnel event table, or declare GA4 funnel out of the IRPAA path and rely on server events only. | Candidate |
| 6 | **Opportunity→ship cycle time not codified.** Timestamps exist (`suggested_actions.created_at`→`approved_at`→`executed_at`; `workflow_run_outcomes.window_start/_end`) but no canonical view. | A query returning detected→shipped latency per opportunity from existing columns (no new columns needed). | Candidate |
| 7 | **No workflow-level agent result log** (success / override / cost-per-opportunity). LLM-level exists via Agnost; workflow-level does not. | A per-`workflow_run` outcome/cost row queryable by `kind`. | Candidate |
| 8 | **No manual-vs-automated task classification** on outcomes. | A column/flag on `workflow_run_outcomes` (or derivable from `kind`) separating Jovie-shipped automation lift from manual. | Candidate |

## Proxy assumptions & 30-day validation

Where true DSP/royalty data is unavailable, IRPAA uses labeled proxies, not invented
numbers:

- **Streaming value** is proxied by `dsp_click_delta` (real `listen` clicks in the
  attribution window) × `streaming_value_weight`. The weight is an assumption (e.g. expected
  streams-per-click × per-stream payout) stated in the gap-1 module, **not** a measured
  royalty.
- **Fan-capture value** is proxied by `new_fans_delta` × `fan_capture_ltv_weight`, seeded
  from realized tip/GMV-per-captured-fan, not a guessed LTV.
- **GMV is real** — Printful order value flows through `gmv_attribution.ts`; it needs no
  proxy and anchors the validation.

Validation path (the 30-day part of "provable in 30-60 days"): once gaps 1–3 land, compare
each proxy term against realized `gmv_delta_cents` and tip revenue over a rolling window and
recalibrate the weights. The proxy is honest only while it is being validated against real
GMV; report the weights and their last-validated date alongside any IRPAA figure.

## Governance

- No competitor brand names anywhere in this system or child issues.
- "Fan capture" / "captured fans" — never the banned routing-jargon term for it.
- No fabricated adoption, traction, or customer-count numbers; IRPAA is computed from the
  tables above or it is not reported.
- Strategic/positioning rationale stays in chat/gbrain per the public-mirrored-repo rule;
  this doc is the technical event-to-metric contract only.
