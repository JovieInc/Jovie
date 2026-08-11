# Component IDs, Versioning & Deterministic Hash Receipts

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

Cards are shared, versioned, deterministically renderable components. This
document defines identity, versioning, and the hash receipt that makes every
card auditable.

## 1. Stable component IDs

Adopt the **Pen contract identity** pattern already used for marketing
components (`apps/web/data/marketing/penContracts.ts`): a stable, human-readable,
globally unique id per component, with a selector/attribute contract.

- Example card ids: `acme.user_growth.hero`, `acme.shipping.hero`,
  `acme.shipping.trend`, `zoe.product.recommendation`.
- Each id is registered in a single canonical registry (mirror
  `MARKETING_PEN_CONTRACT_IDS`): one file that owns all card ids + versions.
- Renderers key off `cardId` + `kind`; the registry is the single source of
  truth for which renderer handles which card.

```ts
export const EDITORIAL_CARD_CONTRACT_IDS = {
  hero: { userGrowth: 'acme.user_growth.hero', shipping: 'acme.shipping.hero' },
  trend: { shipping7d: 'acme.shipping.trend' },
  product: { recommendation: 'zoe.product.recommendation' },
  status: { factoryHealth: 'acme.factory_health.status' },
} as const;
```

### Selector contract

For web/HTML, renderers attach a data attribute so tests and QA can select a
card deterministically:

```html
<div data-card-contract="acme.shipping.hero" data-card-version="1.0.0">…</div>
```

Mirror `marketingPenSelector` → `editorialCardSelector(id: CardId)`.

## 2. Versioning

- Every `CardContract` carries a **semantic version** (`1.0.0`).
- Bump **major** on breaking field changes (renderers/targets must change).
- Bump **minor** on additive, backward-compatible changes (new optional field).
- **Never** reuse an id for a different concept; change the id, not the meaning.
- The version is part of every render and every receipt.

### Renderer versioning

- Each renderer (PNG/HTML/text/web) also has a version. A card's `renderHash`
  binds `cardId + contractVersion + rendererVersion + values + live`.
- If a renderer changes output, the renderer version bumps so old receipts are
  still explainable.

## 3. Deterministic rendering

- Same input (`CardData` + renderer version) → same output bytes for PNG.
- PNG render uses bundled fonts and fixed sizes — no network, no randomness,
  no timestamp watermark from `Date.now()`.
- The human-readable timestamp is derived from `CardData.live.asOf`, not from
  the render clock, so the output is reproducible.
- No LLM in the render path. (Product cards especially: **no LLM call**; render
  adapter data deterministically.)

## 4. Hash receipts

Every render produces a deterministic receipt:

```ts
interface RenderReceipt {
  readonly cardId: string;
  readonly contractVersion: string;
  readonly rendererId: string;
  readonly rendererVersion: string;
  readonly renderHash: string;      // sha256(cardId|contractVersion|rendererId|rendererVersion|canonicalValues|live.asOf)
  readonly values: Record<string, number | string | null>;
  readonly asOfUtc: string;
  readonly passedNoDefaultGuard: boolean;
  readonly target: CardTargetId;
  readonly artifactPath?: string;   // for PNG
  readonly deliveredTo?: string;    // channel, if delivered
}
```

- `renderHash` is computed over **canonicalized** values (sorted keys, stable
  serialization) so it is reproducible across runs.
- Receipts are written to the job/system log (or a durable nearline store) and
  readable back for audit: *what did the card show, as of when, from where, did
  it pass the guard.*
- **Verification:** after a render, read back the receipt and confirm
  `renderHash` matches a recompute and `passedNoDefaultGuard === true`. A card
  sent without a passing receipt is a bug.

## 5. Determinism rules

1. No `Date.now()` / `Math.random()` in the render path.
2. No remote font fetch at render time.
3. Canonical serialization for hashing (stable key order).
4. No LLM in the render path.
5. Same `CardData` → same PNG bytes and same text.
6. Renderer version part of the hash — output change requires a version bump.

## 6. Registry file

- `apps/web/data/editorialCards/contracts.ts` (or `penContracts.ts` extension)
  = canonical registry of card ids, versions, kinds, target lists.
- A unit test asserts: unique ids, valid semver, every `kind` valid, every
  `MetricRef` has a known metric id, and required targets are renderable.