# Bounded Implementation Packets for Gem

Status: **Draft (research lane) — no product code changed, no public issues yet**
Owner: Gem (implementation) · Steward: Summer · Outcome owner: Tim
Updated: 2026-08-10

These are **bounded, sequentially-dependable implementation packets**. Gem
implements each packet independently, in order. Each packet has a concrete
deliverable, acceptance gate, and rollback. Do not create public GitHub issues
from these yet; this is the canonical packet set for Gem to implement.

Build order follows the work-backwards doctrine: **contracts → renderers →
adapters → cron admission → rollout.**

---

## Packet 0 — Canonical contracts (schema + live-data contract)

**Goal:** make the card system describable and testable before any render.

**Deliverables**
1. `apps/web/data/editorialCards/contracts.ts` — canonical registry of card ids,
   kinds, versions, target lists, privacy class (mirror `penContracts.ts`).
2. Shared TS types for `CardContract`, `MetricRef`, `CardData`, `CardValue`,
   `LiveDataContract`, `MetricSeries`, `DataWindow`, `RenderReceipt`
   (per `card-schema.md`, `live-data-contract.md`, `component-ids-versioning.md`).
3. A `noDefaultGuard` validator: a `CardData` is valid only if every required
   `values[metricId]` is non-null, traceable to a `sourceKey`, and its `asOf` is
   within freshness policy. **No hardcoded hero fallback.**
4. A `renderHash` helper over canonicalized values.
5. Unit tests: unique ids, valid semver, kind→field enforcement, ref→metric
   resolution, no-default-guard fail-closed, privacy-class routing.

**Acceptance gate:** unit tests green; no renderer exists yet; nothing is
delivered to any channel.

**Rollback:** pure TS + tests; revert commit.

---

## Packet 1 — Deterministic PNG renderer (hero + trend)

**Goal:** render a hero card and a trend card to PNG from live `CardData`.

**Deliverables**
1. Extend the ImageResponse pattern (`apps/web/lib/share/*`): `CardShell`,
   `HeroCard`, `TrendCard` renderers (`renderer-targets.md` §2).
2. Noir Ion dark-first theme + electric blue `#11afff` accent
   (`chart-rules.md` §4). Bundled fonts, fixed sizes.
3. Trend chart: 7 daily Pacific buckets, CMA smoothing over real buckets only
   (no extrapolation / gap-fill), today bucket labeled in-progress, accessible
   tabular fallback (`chart-rules.md`).
4. Wire `renderHash` into the image route; write a `RenderReceipt`.
5. Determinism test: render twice → identical bytes.

**Acceptance gate:** deterministic PNGs; no-default guard fails closed; receipt
written; deterministic test passes. **Not yet** wired to any personal channel.

**Rollback:** renderer is flag-gated + versioned; revert or flag off.

---

## Packet 2 — Text skins (iMessage + Telegram) + delivery

**Goal:** human-readable text for personal channels, plus delivery rules.

**Deliverables**
1. `imessage_text` and `telegram_text` skins from `CardData` — voice-clean (no
   ISO/epoch/raw JSON), one hero + ≤4 stat rows + footer, Telegram-safe
   (`renderer-targets.md` §4).
2. A `CardDeliverer` that attaches the PNG + sends the human sentence on iMessage;
   deletes the transient PNG after send; respects `deliver=local` for cron.
3. Fail-to-human-text: if the no-default guard fails, send short human text, no
   card, no blank message.

**Acceptance gate:** on-demand iMessage render verified (human sentence +
attachment + delete-after-send); no blank/cron noise.

**Rollback:** delivery flag off; text + attachment revert cleanly.

---

## Packet 3 — Metric adapters (user-growth hero, shipping hero + trend, product)

**Goal:** satisfy the card contract's `MetricRef`s with live, source-grounded
`MetricSeries`.

**Deliverables**
1. `MetricAdapter` interface + registry keyed by `metricId`.
2. **Shipping hero:** merges in `[Pacific midnight today, now]` (not rolling 24h),
   lane-attributed (Gem vs Codex vs manual) per `jovie-shipper-ops`.
3. **Shipping trend:** 7 daily Pacific buckets from GitHub merged-PR records
   (weekly UTC windows to respect the 1000-result search cap).
4. **User-growth hero:** new users / activated / conversion from Neon/PostHog.
5. **Product adapter (Zoe):** `zoe.product.recommendation` from Apollo/merchant
   source — image/title/price/merchant/URL, **no LLM call**, deterministic.
6. Each adapter returns `MetricSeries` (provenance, asOf, fetchedAt, confidence,
   sourceUrl, window) and a unit test + fixture series.

**Acceptance gate:** adapters satisfy their card's refs; missing telemetry →
`unknown` (never `0`/healthy); privacy class enforced (personal vs ops).

**Rollback:** adapters are read-only; a broken adapter fails closed to
unavailable (human text), never stale numbers.

---

## Packet 4 — Cron admission

**Goal:** attach card renders to existing schedulers, no new high-frequency cron.

**Deliverables**
1. Wire card render into an **existing** job that already fetches the same
   providers (heartbeat / pipeline-scoreboard / daily digest) — per
   `docs/CRON_REGISTRY.md` + AGENTS.md guardrails.
2. On-demand path for Tim-requested cards (iMessage).
3. API-volume budget check: `(calls/run) × (runs/day) × 30` acceptable; no
   O(users) fan-out.

**Acceptance gate:** cards render on schedule at bounded volume; `deliver=local`
default respected; no new cron entry without approval.

**Rollback:** remove the card hook from the job; flag off.

---

## Packet 5 — Web/Jovie UI + full acceptance + rollout

**Goal:** render cards in the web/console UI and complete rollout.

**Deliverables**
1. React card components (`web` target) using the design system;
   `table`/`composition` grid for dashboard cards.
2. Feature flags per card family (`EDITORIAL_CARDS` envelope + per-target).
3. Full acceptance suite (`acceptance-rollout.md` §1) run green.
4. Rollout via `develop` → pipeline (never direct to `preview`/`main`).

**Acceptance gate:** web renders; all acceptance tests pass; flags control
rollout/rollback.

**Rollback:** flag off per family; renderer/adapter version revert.

---

## Sequencing & dependencies

```
Packet 0 (contracts)
   │
   ├─► Packet 1 (PNG hero+trend)
   │        │
   │        └─► Packet 2 (text + delivery)   [needs 0,1]
   │
   └─► Packet 3 (adapters)                  [needs contract refs from 0]
            │
            └─► Packet 4 (cron admission)   [needs 1,2,3]
                     │
                     └─► Packet 5 (web + rollout)
```

- Packets 1 and 3 can proceed in parallel after Packet 0.
- Packet 2 depends on Packet 1 (needs the PNG to attach).
- Packet 4 depends on 1, 2, 3 (needs renderers, text, and adapters).
- Packet 5 depends on all.

## Cross-cutting rules for every packet

1. **No LLM in the render path.** Product cards especially: no LLM call.
2. **No-default guard always.** A card that repeats a stale number is a bug.
   Fail closed to human text on personal channels.
3. **Pacific midnight-to-now** for operational windows, never rolling 24h.
4. **Smoothing never invents data.** CMA over real buckets only.
5. **No new high-frequency cron.** Ride existing schedulers.
6. **Privacy separation.** Personal (`zoe.*`) vs ops (`acme.*`) never cross.
7. **Receipt on every render.** `renderHash` + guard-pass + as-of + target.
8. **Human-readable delivery.** iMessage = human text + attachment, no blank/
   cron noise. No ISO/epoch/raw JSON in user-facing text.
9. **Follow repo branch/CI rules.** Push to `develop`; never `preview`/`main`.
10. **Verify with tools.** Every factual claim points to a file/command/query;
    proposed-but-not-run SQL is labeled as such.

## Not yet done (stated explicitly)

- No product code changed; these are canonical packets only.
- No public GitHub issues created.
- No cron scheduled.
- No feature flags changed.
- No metric fetched. (Any SQL/query referenced here is proposed, not executed.)