# Ovie company cost ledger — research brief and source matrix

- Status: slice 1 of JOV-5311 — domain contract + deterministic evaluation
- Canonical code: `apps/web/lib/ovie/cost-ledger/`
- Distinct from `apps/web/lib/finance/*` (JOV-4610), which is the
  **owner-scoped creator finance** domain. This ledger is the **company**
  operating-cost projection — no `owner_user_id`, no creator sharing model,
  no bookkeeping/GL ambition.

## Existing-truth audit (what is reused, not forked)

| Existing primitive | Owner issue | Reuse decision |
| --- | --- | --- |
| `apps/web/lib/admin/costs.ts` + `admin_costs` table + `/app/admin/costs` page | JOV-2498 | Manual seed list of known vendors (Vercel AI Gateway, Neon, Anthropic, OpenAI, OpenRouter…). Slice 2+ ingests these rows as `manual`/`vendor-account-page` evidence — they are not settled truth. |
| `apps/web/lib/ovie/shipping-state/capacity.ts` (`jovie.capacity-horizon/v1`, `codex:*` leases, `bankedCount`, `subscriptionStatus`, resets, `usableRemaining`) | JOV-5755 / JOV-4207 | Canonical account-health/banked source. Cost-ledger `CostLedgerCapacity` records must be **projected from** this horizon, never scraped a second time. |
| `apps/web/lib/ovie/lyb-mrr.ts` (`jovie.lyb-daily-mrr/v1`, RevenueCat) | — | Pattern for verified-MRR provenance (state: fresh/stale/unavailable/unreconciled, single-point parse, freshness deadline). Same shape reused for `CostLedgerRevenue`. |
| `apps/web/lib/finance/metric-contracts.ts` | JOV-4616 | Formula/window registry for burn/runway wording. Company ledger mirrors its "metric id + definition version" provenance contract but does not share its owner-scoped storage. |
| `apps/web/lib/hud/ai-ops.ts` | JOV-4207 | Provider ops status surface; evidence for account health where it already reads GitHub/Hermes state. |
| `canon/FLEET.md` scoreboard ($935/mo known floor, $0 cash/MRR as of 2026-08-17) | — | Founder-confirmed baseline = `manual` authority, freshness-dated. Never hardcoded into code. |

## Source-authority matrix

| Field | Authoritative | Secondary | Observation-only |
| --- | --- | --- | --- |
| Settled amount/currency/date | `ledger-settlement` (bank/card export) | vendor invoice | `billing-email` receipt |
| Plan / seats / cadence | `vendor-billing-api` | `vendor-account-page` | `billing-email`, `manual` |
| Renewal/expiry | `vendor-billing-api` | `billing-email` renewal notice | `manual` |
| Payment instrument label + last4 | `ledger-settlement` | `vendor-billing-api` | `manual` |
| Usage/remaining/reset/banked | `runtime-telemetry` (capacity horizon) | `vendor-billing-api` | `vendor-account-page` |
| Prepaid credit balance/expiry | `vendor-billing-api` | `vendor-account-page` | `manual` |
| Verified MRR / cash balance | provider metric endpoint / `ledger-settlement` | — | — |

Rules enforced in code:

- `billing-email` can reach `observed`, never `reconciled`.
- A merchant string never invents plan/seat/usage (transactions carry
  `merchantLabel` only; mapping is via explicit `accountId`).
- Prepaid credits (`CostLedgerCredit.cashEquivalent: false`) are owned
  operating capacity — excluded from runway cash by construction.
- No PAN, credentials, tokens, or raw email bodies persist;
  `assertPaymentInstrumentSafety` rejects 8+ digit fragments.

## Reconciliation semantics

`unknown → observed → (stale | unreconciled | conflict) → reconciled`.
See `reconcileAccount` in `ledger.ts` for the exact decision order:
settled match > conflict > stale > observed > unreconciled > unknown.

## Normalization

Annual → /12, quarterly → /3, weekly → ×52/12 (integer-rounded cents,
`kind: 'normalized'`). Usage-based and unknown-cadence accounts produce
`null` — the UI must render `Not measured`, never `$0`. Summary `basis`
distinguishes `settled` from `mixed`/`projected`.

## Provider notes (verified surface only)

- **OpenAI/Codex accounts:** per-account rows; usage/banked/reset come from
  the capacity horizon (`runtime-telemetry`), not a second scrape.
- **HyperAgent / Cloudflare credits:** `vendor-billing-api`/`account-page`
  reads only; no balance is ever hardcoded (the "$7k/$10k" figures are
  founder recollections until measured).
- **RevenueCat (LYB MRR):** options-endpoint day resolution; single-point
  parse; freshness deadline 36h.

## Unresolved questions

- No bank/card ledger connector exists yet — `ledger-settlement` evidence
  is defined but unpopulated. Slices 2+ need an authorized Mercury/export
  source or stay `observed`.
- Billing-scoped email retrieval needs an explicit authorized mailbox
  boundary before use; nothing ingests email yet.
- Which vendors expose machine-readable balance APIs today (Neon, Vercel AI
  Gateway, Anthropic billing) must be verified per-vendor before adapters.
- Currency: all normalization assumes a single currency per aggregation;
  FX is explicitly out of scope until a persisted FX-assumption contract
  exists.

## Follow-up slices

1. Read-only Ovie page: KPI strip + accounts table + evidence rail built on
   `summarizeLedger`/`detectExceptions`.
2. Source adapters: `admin_costs` seed ingestion, capacity-horizon →
   `CostLedgerCapacity`, lyb-mrr → `CostLedgerRevenue`.
3. Ledger-settlement ingestion once an authorized source exists.
4. Entitlement→fleet projection (paid capacity visible to Summer) per the
   2026-09-30 extension, reusing `jovie.capacity-horizon/v1` leases.
