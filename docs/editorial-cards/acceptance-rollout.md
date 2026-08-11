# Acceptance Tests & Rollout/Rollback

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

## 1. Acceptance test matrix

### A. Contract & registry
- [ ] Every card id is unique, stable, valid semver.
- [ ] Every `MetricRef` resolves to a registered adapter/metric id.
- [ ] Every `kind` is valid; allowed fields enforced per kind.
- [ ] Registry unit tests pass (`pnpm --filter web test`).

### B. Live-data / no-default guard
- [ ] A card renders **only** from live `MetricSeries`.
- [ ] If a required metric is missing/null/unavailable, the card **fails closed**
      (no stale/blank number; short human text on personal channels).
- [ ] Renderer contains **no** hardcoded hero default (regression test greps out
      `HERO_CARD_DEFAULTS`-style fallback constants).
- [ ] `values[metricId]` non-null ⇔ traceable to a `sourceKey` ⇔ `asOf` within
      freshness policy.
- [ ] Missing telemetry renders as `unknown`, never `$0` / empty / 0 / healthy.

### C. Window & timezone
- [ ] Merge/shipping "today" = Pacific midnight-to-now, not rolling 24h.
- [ ] Boundary test: at a known Pacific time, the UTC window equals
      `[Pacific midnight, now]`.
- [ ] 7-day trend buckets are Pacific calendar days (DST-aware).

### D. Trend chart
- [ ] 7 daily Pacific buckets render.
- [ ] Smoothing is a CMA over real buckets; **no extrapolation, no gap-fill**.
- [ ] Missing day renders as a visible gap, not a fake interpolated point.
- [ ] Today's bucket labeled in-progress/partial.
- [ ] Line is electric blue `#11afff` on dark canvas; no new colors.
- [ ] Accessible tabular fallback present in text + caption on PNG/web.
- [ ] `prefers-reduced-motion` respected (no chart animation).

### E. Renderers & determinism
- [ ] Same `CardData` → same PNG bytes (runs twice, hashes equal).
- [ ] No LLM in render path; product card makes **no LLM call** (deterministic).
- [ ] Per-target skins: PNG attachment, HTML/web, iMessage text, Telegram text
      all render from the same `CardData`.
- [ ] iMessage text is human-readable/voice-clean (no ISO/epoch/raw JSON);
      short human sentence + attachment.
- [ ] Transient PNG deleted after send (no accumulating card pile).

### F. Receipts & audit
- [ ] Every render writes a `RenderReceipt` with `renderHash`.
- [ ] Receipt read-back confirms `renderHash` matches recompute and
      `passedNoDefaultGuard === true`.
- [ ] Receipt states what/as-of/from-where/confidence/target.

### G. Privacy
- [ ] Personal (`zoe.product.*`) cards route only to the owner's channel; never
      to public or internal-aggregate targets.
- [ ] Ops (`acme.shipping.*`, `acme.user_growth.*`) cards are internal-only.
- [ ] Product image failure degrades to placeholder, no external URL leak.

### H. Delivery rules
- [ ] iMessage receives useful human-written text + attachment only; no blank/
      cron noise.
- [ ] Cron defaults `deliver=local`; only time-sensitive founder decisions ping
      the chat.
- [ ] A card that failed the no-default guard is not delivered; short human text
      is sent instead.

## 2. Rollout plan

Follow the repo's branch protection + CI/CD pipeline rules (never push to
`preview`/`main` directly; push to `develop`, promote via pipeline).

1. **Phase A — Contracts + registry + unit tests** (pure, no render).
   - Land on `develop`, CI green.
2. **Phase B — PNG renderer** for `hero` + `trend` bound to live data, with
   no-default guard + receipt.
   - Canary: render one card to a local/console surface (not a personal channel).
   - Verify determinism + guard on the canary.
3. **Phase C — Text skins + delivery** (iMessage/Telegram).
   - Enable on a **low-risk internal surface** first (console/dashboard), not
     Tim's iMessage.
   - Then enable iMessage **on demand only** (when asked), verify the human
     sentence + attachment + delete-after-send.
4. **Phase D — Metric adapters** (user-growth hero, shipping hero + trend,
   product adapter).
   - Each adapter lands with its own unit test + a fixture series.
5. **Phase E — Cron admission**.
   - Attach card render to an **existing** scheduler (heartbeat /
     pipeline-scoreboard / daily digest), no new high-freq cron.
   - Verify API-volume budget: `(calls/run) × (runs/day) × 30` is acceptable.
6. **Phase F — Full acceptance + rollout to web/Jovie UI.**

## 3. Feature flags

- Gate each card family behind a Statsig app flag (use the existing flag
  registry: `apps/web/lib/flags/contracts.ts`, `useAppFlag`/`getAppFlagValue`).
- Flags: `EDITORIAL_CARD_PNG`, `EDITORIAL_CARD_TEXT`, `EDITORIAL_CARD_WEB`,
  `EDITORIAL_CARD_ADAPTERS` (or a single `EDITORIAL_CARDS` envelope).
- Personal-channel delivery gated separately so op cards can ship without
  touching iMessage.

## 4. Rollback

- **Per-phase rollback:** flip the relevant flag off → cards stop rendering in
  that target. No data mutation, purely presentational.
- **Renderer rollback:** revert the renderer version; because `renderHash`
  includes renderer version, old receipts remain explainable.
- **Adapter rollback:** a bad adapter fails closed (cards to that metric become
  unavailable → human text), so a broken adapter degrades gracefully, it never
  prints stale numbers.
- **No-default guard is the safety net:** any unresolved metric fails closed
  rather than showing a fabricated value, so a bad deploy cannot produce a
  misleading editorial card.
- Stop rule: if a card shows a stale/hardcoded number in production, treat it
  as a P0 bug, disable that card family's flag, and fix the adapter mapping
  before re-enabling.

## 5. Acceptance command anchors

- Registry/unit: `pnpm --filter web test`
- Determinism: run the renderer twice, compare bytes/hash.
- No-default regression: fixture with a missing metric must fail closed.
- Window: unit test on a known Pacific time.
- Privacy: unit test that personal cards cannot reach public/internal-aggregate
  targets.