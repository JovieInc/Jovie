# Jovie Editorial Metric-Card System — Canonical Architecture

Status: **Draft (research lane) — not yet implemented, no product code changed**
Owner: Gem (implementation) / Summer (canonical steward) / Tim (outcome)
Last updated: 2026-08-10
Location: `docs/editorial-cards/`

## Why this exists

Jovie's editorial/image card presentation is currently bespoke: each channel
(internal ops dashboards, iMessage attachments, Telegram, web/Jovie UI, future
channels) hand-renders its own cards with its own assumptions. This produces:

- stale/hardcoded hero numbers (the `HERO_CARD_DEFAULTS["hero_value"]="18"`
  bug family — a renderer repeated a dead number because the live report field
  was never mapped into the hero block);
- rolling-24h windows where a Pacific **midnight-to-now** window was intended;
- no shared provenance, so a card cannot say *what* it shows, *as of when*, or
  *where it came from*;
- no deterministic render receipt, so a card cannot be audited or re-derived.

This document formalizes the card system as a **shared, reusable presentation
system**: a canonical card contract, a live-data contract, a set of deterministic
renderers that emit the same card to every target, and a work-backwards build
order (contracts → renderers → metric adapters → cron admission).

## Scope & non-goals

**In scope**
- Canonical card schema (metric, hero, trend, product, status, table/composition).
- Live-data contract (provenance, freshness, timezone/window, as-of, confidence,
  source URL, no-default guard).
- Renderer targets: PNG/image attachment, HTML/web, Telegram/iMessage-safe text.
- Chart rules (7-day daily buckets, Pacific, smoothing that never invents data,
  electric-blue palette, accessible fallback).
- Shareable component IDs + versioning + deterministic rendering/hash receipts.
- Data provider/adapters + cron admission admitted *from* the card contract.
- Privacy boundaries (personal product cards vs Jovie ops metrics).
- Acceptance tests + rollout/rollback.

**Out of scope (explicitly)**
- No product code changes in this packet. This is a design + bounded
  implementation-packet lane for Gem.
- No public GitHub issues created yet.
- No new high-frequency cron; any schedule must ride the existing schedulers
  (see `docs/CRON_REGISTRY.md` and the AGENTS.md scheduling guardrails).
- Naming/rank/scoring formulas are Fable 5's domain, not hand-written here.

## Design principles (work backwards)

1. **Contracts first, renderers second, adapters third, cron fourth.**
   Nothing renders until the card contract and the live-data contract exist.
2. **Live and source-grounded, never hardcoded.** A card that repeats a stale
   number is a bug. The renderer must fail closed (no card) when the live value
   cannot be mapped to a real field.
3. **One render, many targets.** The same contract renders the same content to
   iMessage attachment, Telegram, web, and future channels. Channel only changes
   *presentation skin*, never *data*.
4. **Deterministic and auditable.** Same input → same output. A hash receipt
   proves which card version + which input produced the artifact.
5. **Pacific midnight-to-now for operational windows.** Merge/shipping "today"
   means Pacific midnight → now, not the last rolling 24h, unless the contract
   says otherwise.
6. **Smoothing must not invent data.** A trend line may be smoothed for
   legibility only in a way that preserves the observed series (centered moving
   average over real buckets, or a monotonic knot-preserving fit), never
   extrapolated or hallucinated.
7. **Human-readable delivery on personal channels.** iMessage receives useful
   human-written text plus attachments only; no blank/cron noise. Cards are the
   attachment; the message is the human sentence.

## Architecture at a glance

```
Metric Providers (PostHog/Neon/GitHub/Linear/...)
   │  fetch + normalize → MetricSeries (provenance + freshness + as-of)
   ▼
Card Contract (cardId, version, kind, metric refs, layout)
   │  resolve metric refs → bound CardData (no-default guard)
   ▼
Renderers (per target)
   ├── PNG/image attachment  (ImageResponse, deterministic, font-bundled)
   ├── HTML/web              (React component / console dashboard)
   └── Text (Telegram/iMessage-safe, human-readable)
   ▼
Delivery (iMessage attachment, Telegram, web route, future channels)
   └── hash receipt + delete-after-send for transient attachments
```

## Build order for Gem (bounded phases)

1. **Phase A — Canonical contracts** (this doc + `card-schema.md`):
   finalize `CardContract`, `MetricRef`, `MetricSeries`, `LiveDataContract`.
2. **Phase B — Deterministic PNG renderer** for `hero` and `trend` cards using
   the existing ImageResponse pattern (`apps/web/lib/share/*`), bound to live
   data, with a no-default guard and a hash receipt.
3. **Phase C — Channel skins**: iMessage attachment + human text, Telegram-safe
   text, web/HTML render.
4. **Phase D — Metric adapters**: user-growth hero metric, shipping hero metric,
   shipping trend (7-day Pacific), product-card adapter (Zoe), merge-card window.
5. **Phase E — Cron admission**: attach the card render to existing schedulers;
   no new high-frequency cron.
6. **Phase F — Acceptance + rollout/rollback** (see `acceptance-rollout.md`).

Each phase is a separate bounded packet file. See `./PACKETS.md` for the index
and per-phase acceptance gates.

## Files in this directory

| File | Purpose |
|------|---------|
| `README.md` (this file) | Canonical architecture + principles + build order |
| `card-schema.md` | Canonical card schema (kinds, fields, composition) |
| `live-data-contract.md` | Provenance, freshness, window, as-of, no-default guard |
| `renderer-targets.md` | PNG/HTML/text targets + channel rules |
| `chart-rules.md` | 7-day buckets, Pacific, smoothing, palette, accessibility |
| `component-ids-versioning.md` | Card IDs, versioning, hash receipts |
| `providers-cron-privacy.md` | Metric adapters, cron admission, privacy boundaries |
| `acceptance-rollout.md` | Acceptance tests + rollout/rollback |
| `PACKETS.md` | Bounded implementation packets for Gem (index + per-phase) |

## Grounding references (existing repo surfaces)

- **Deterministic PNG rendering:** `apps/web/lib/share/story-renderers.tsx`,
  `story-layout.tsx`, `image-utils.ts` (ImageResponse, font-bundled, THEME).
  Extend this pattern rather than introducing a new renderer stack.
- **Pen contract identities (deterministic component IDs):**
  `apps/web/data/marketing/penContracts.ts` — the pattern for stable, versioned,
  shareable contract IDs (`data-pen-contract` selectors).
- **Noir Ion design tokens:** `design.tokens.json`, `apps/web/design/tokens.json`
  — electric-blue Ion accent `#11afff` is the canonical palette accent.
- **Console HTML dashboard:** `apps/console/lib/render-dashboard.ts` — HTML
  string render target pattern.
- **Scheduling guardrails:** `AGENTS.md` (Infrastructure & Scheduling
  Guardrails), `docs/CRON_REGISTRY.md` — no new high-freq cron without reuse.
- **iMessage editorial-card rules:** `cos-comms-style` skill (one hero number +
  stat rows + footer, deterministic HTML→PNG, delete-after-send, live data).
- **Shipping velocity chart recipe:** `jovie-shipper-ops` →
  `references/shipping-velocity-chart.md` (weekly windows, lane attribution).