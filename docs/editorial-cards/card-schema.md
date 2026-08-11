# Canonical Card Schema

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

## 1. The `CardContract` (what a card *is*)

A card is a **versioned, deterministic presentation of live metric data**. It is
not a static image; it is a contract that, when bound to live data, renders to
one or more targets.

```ts
interface CardContract {
  /** Stable card identity, e.g. "acme.shipping.hero", "acme.shipping.trend",
   *  "acme.user_growth.hero", "zoe.product.recommendation". */
  readonly cardId: string;
  /** Semantic version of the contract. Bump on any breaking field change. */
  readonly version: string; // e.g. "1.0.0"
  /** Card kind — drives the renderer + allowed fields. See §2. */
  readonly kind: CardKind;
  /** Human title (short, readable aloud). */
  readonly title: string;
  /** Optional one-line subtitle / eyebrow. */
  readonly subtitle?: string;
  /** The metric(s) this card needs. Each ref resolves via a metric adapter. */
  readonly metrics: readonly MetricRef[];
  /** Layout / composition hints for the renderer. See §4. */
  readonly layout?: CardLayout;
  /** Channel skins: which render targets this card participates in. */
  readonly targets: readonly CardTargetId[];
  /** Provenance label shown on the card footer (e.g. "Jovie ops · Aug 10"). */
  readonly label?: string;
  /** Optional footer link (e.g. source URL, dashboard URL). */
  readonly sourceUrl?: string;
}
```

### MetricRef (declarative, replaceable)

```ts
interface MetricRef {
  /** Logical metric id, e.g. "throughput.prs_merged_pacific_today". */
  readonly metricId: string;
  /** What to display if this metric is a single value. */
  readonly presentation?: 'value' | 'delta' | 'percent' | 'text';
  /** Where to bind this metric in the card (hero, stat row N, trend series). */
  readonly slot?: string;
  /** Optional formatting override (e.g. integer, compact, currency). */
  readonly format?: string;
}
```

## 2. Card kinds

| Kind | Purpose | Core fields | Renderer |
|------|---------|-------------|----------|
| `metric` | A single value + optional delta (a stat cell). | value, delta, unit | text + PNG cell |
| `hero` | One headline number + a few stat rows + footer. The iMessage editorial card. | heroValue, heroLabel, statRows[], footer | PNG + text |
| `trend` | A time series chart (7-day Pacific default). | series[], buckets[], unit | PNG chart + text table |
| `product` | A product recommendation (Zoe): image/title/price/merchant/URL. **No LLM call.** | imageUrl, title, price, merchant, url | PNG card + text |
| `status` | A status strip (health/readiness), e.g. factory health. | status, messages[], at | text + PNG |
| `table` / `composition` | A grid of other cards (a dashboard card). | cards[] | HTML/web |

## 3. The `CardData` (bound, live, non-default)

A `CardContract` is bound against live `MetricSeries` to produce `CardData`.
**This is where the no-default guard lives.**

```ts
interface CardData {
  readonly cardId: string;
  readonly version: string;
  readonly kind: CardKind;
  /** The resolved, live values keyed by metricId. */
  readonly values: Record<string, CardValue>;
  /** Provenance + freshness for the whole card (see live-data-contract.md). */
  readonly live: LiveDataContract;
  /** Render hash — deterministic fingerprint of (cardId, version, values, live). */
  readonly renderHash: string;
}

interface CardValue {
  readonly value: number | string | null;
  readonly display: string;      // pre-formatted, human-readable
  readonly delta?: number | null;
  readonly deltaDisplay?: string | null;
  readonly unit?: string | null;
  readonly sourceKey: string;    // which MetricSeries produced this
  readonly asOf: string;         // ISO-8601 UTC
  readonly confidence: Confidence;
}
```

### No-default guard (mandatory)

- A `CardValue` **must** come from a live `MetricSeries`, never from a
  hardcoded fallback in the renderer.
- If a required metric ref cannot be resolved to a live value, the card **fails
  closed**: it does not render a stale/blank number. The broken render's receipt
  is written to the log and, on a personal channel, the deliverer sends short
  human text ("shipping numbers unavailable right now") instead of a card.
- The renderer **must not** contain `HERO_CARD_DEFAULTS["hero_value"] = "18"`
  style constants. Validation rejects any card whose `values[metricId]` is
  missing, `null` from a fallback, or not traceable to a `sourceKey`.

## 4. Layout / composition

For `hero` cards (the canonical iMessage editorial card), the layout is fixed:

```
┌──────────────────────────────┐
│  eyebrow / label (muted)     │
│  HERO VALUE (large, accent)  │
│  hero label (e.g. "merged")  │
│  ─────────────────────────── │
│  stat row 1     value  delta │
│  stat row 2     value  delta │
│  [ ... up to ~4 rows ]       │
│  ─────────────────────────── │
│  footer: "As of Aug 10 9:15a │
│   pt · source"               │
└──────────────────────────────┘
```

- One hero number, a few stat rows (≤4), a footer. This matches the
  `cos-comms-style` iMessage editorial-card rule.
- **maxRows** default 4; more rows belong in a `table`/`composition` card, not
  a hero card.
- `table`/`composition` nests `CardContract[]` and renders as a grid (web/HTML)
  or a vertical stack (text/PNG multi-page).

## 5. Examples

### Shipping hero (merge card, Pacific midnight-to-now)

```ts
{
  cardId: "acme.shipping.hero",
  version: "1.0.0",
  kind: "hero",
  title: "Shipping today",
  metrics: [
    { metricId: "throughput.prs_merged_pacific_today", slot: "hero" },
    { metricId: "throughput.prs_open", slot: "row1" },
    { metricId: "throughput.mq_entries", slot: "row2" },
    { metricId: "throughput.gem_attributed_today", slot: "row3" },
  ],
  targets: ["png", "imessage_text", "telegram_text"],
  label: "Jovie ops",
}
```

### User-growth hero (hero metric)

```ts
{
  cardId: "acme.user_growth.hero",
  version: "1.0.0",
  kind: "hero",
  title: "New users",
  metrics: [
    { metricId: "activation.new_users_pacific_today", slot: "hero" },
    { metricId: "activation.activated_pacific_today", slot: "row1" },
    { metricId: "activation.signup_conversion_7d", slot: "row2" },
  ],
  targets: ["png", "web", "imessage_text"],
}
```

### Shipping trend (7-day smoothed electric-blue line)

```ts
{
  cardId: "acme.shipping.trend",
  version: "1.0.0",
  kind: "trend",
  title: "Merges · last 7 days",
  metrics: [
    { metricId: "throughput.prs_merged_daily_7d", slot: "series" },
  ],
  targets: ["png", "web", "telegram_text"],
  layout: { chartDays: 7, timezone: "America/Los_Angeles", smoothing: "cma3" },
}
```

### Product recommendation (Zoe, deterministic, no LLM call)

```ts
{
  cardId: "zoe.product.recommendation",
  version: "1.0.0",
  kind: "product",
  title: "Recommended",
  metrics: [], // product data comes from the product adapter, not a metric
  targets: ["png", "web", "imessage_text"],
}
```

Product cards carry `imageUrl, title, price, merchant, url` directly from the
product adapter (Apollo/merchant source), rendered deterministically. **No LLM
call** — the recommendation is a deterministic render of adapter data.

## Validation rules

1. `cardId` is unique and stable across versions.
2. Every `MetricRef` resolves to a live `MetricSeries`; otherwise fail closed.
3. `kind` determines allowed fields; a `hero` card cannot silently become a
   `trend` card.
4. All timestamps in `CardData.live` are ISO-8601 UTC; display strings are
   human-readable (no ISO/epoch in user-facing text).
5. `renderHash` is present and deterministic before any render is sent.