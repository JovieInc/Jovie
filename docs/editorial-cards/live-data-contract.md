# Live-Data Contract

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

Every card is bound to live data. This document defines the contract that makes
a card's numbers **live, source-grounded, and auditable** — and the guard that
makes a stale/hardcoded number a hard failure, not a style choice.

## 1. The `MetricSeries`

A metric adapter fetches a source and normalizes it into a `MetricSeries`. This
is the only thing a renderer may read for a live value.

```ts
interface MetricSeries {
  readonly metricId: string;          // logical id (matches MetricRef.metricId)
  readonly sourceKey: string;         // which adapter/producer wrote this
  readonly provider: string;          // e.g. "posthog" | "neon" | "github" | "linear"
  readonly value: number | string | null;   // null only if genuinely unavailable
  readonly unit?: string | null;
  readonly window?: DataWindow;       // the window this value describes
  readonly asOf: string;              // ISO-8601 UTC — when the source was read
  readonly fetchedAt: string;         // ISO-8601 UTC — when the adapter ran
  readonly freshnessPolicy: 'live' | 'snapshot' | 'stale_allowed';
  readonly confidence: Confidence;
  readonly sourceUrl?: string | null; // canonical link to the source/dashboard
  readonly provenance: string;        // free-text: "computed from GitHub merged PRs ..."
}
```

## 2. Window & timezone rules

- **Operational windows are Pacific midnight-to-now** (`America/Los_Angeles`),
  **not rolling 24h.** This is the explicit requirement for merge/shipping
  "today" cards. A merge card showing "today" must count
  `[Pacific midnight today, now]`, converted to UTC for the query.
- Example: at `2026-08-10T15:00:00-07:00` (Pacific), "today" =
  `[2026-08-10T07:00:00Z, 2026-08-10T22:00:00Z]`.
- A `DataWindow` documents the window explicitly so the renderer can print it
  correctly ("as of Aug 10 9:15a pt") and never mislabel a rolling window as a
  Pacific day.

```ts
interface DataWindow {
  readonly scope: 'pacific_midnight_today' | 'pacific_today_to_now'
    | 'last_7_pacific_days' | 'rolling_24h' | 'all_time' | 'custom';
  readonly startUtc: string;   // ISO-8601 UTC
  readonly endUtc: string;     // ISO-8601 UTC
  readonly timezone: string;   // "America/Los_Angeles" for operational windows
}
```

- `rolling_24h` is **discouraged** for operational cards; use it only when the
  contract explicitly requests it (e.g. a "last 24h activity" card).

## 3. Freshness

- Each series declares how fresh it is allowed to be (`freshnessPolicy`).
- `live`: must be fetched at render time (or within a small, named TTL).
- `snapshot`: read from a durable daily snapshot (stable idempotency key:
  `(sourceKey, periodStartUtc, periodEndUtc)`), per the `implementation-packet-recon`
  operating pattern.
- `stale_allowed`: only for metrics that are inherently slow-moving and where
  staleness is acceptable (label it on the card).
- **A card must not be sent if its `asOf` is older than the freshness policy
  allows.** The deliverer fails closed to short human text on personal channels.

## 4. Confidence

```ts
type Confidence = 'high' | 'medium' | 'low' | 'unknown';
```

- `high`: directly from the authoritative source, window verified.
- `medium`: computed from a source with minor aggregation/coverage caveats.
- `low` / `unknown`: partial or inferred — generally **not** suitable for a
  user-facing editorial card; render it only with an explicit caveat or not at all.

## 5. Provenance & source URL

- Every series carries a `sourceUrl` (dashboard, GitHub query, Linear filter,
  PostHog insight) so the card footer can link to authority.
- `provenance` is a short human sentence explaining how the number was derived,
  so a future reader (human or agent) can reproduce it.

## 6. The no-default guard (hard rule)

- The renderer **never** falls back to a hardcoded constant when a live value is
  missing. Root cause of the repeated-stale-number bug was a renderer reading
  `HERO_CARD_DEFAULTS["hero_value"] = "18"` when the live report field was never
  mapped to the hero.
- **Explicit card blocks win when present.** If the live report has a
  `hero_card` / `preview_card` block, bind from it. Otherwise derive the hero
  value from the report's real throughput field (e.g.
  `throughput.prs_merged_pacific_today`).
- **The default is only a last-resort empty-value guard, never a real number.**
  If a value is genuinely unavailable, the card fails closed (no card, or a
  card that says "unavailable") — it never prints a fabricated number.
- Validation: before any renderer emits, assert every required `values[metricId]`
  is non-null, traceable to a `sourceKey`, and its `asOf` is within policy.

## 7. Receipts

- Each bound `CardData` gathers `live` provenance into a machine-readable
  receipt (see `component-ids-versioning.md#hash-receipts`).
- The receipt must be readable back from the system of record or log after a
  render, so a card can be audited: *what did it show, as of when, from where,
  at what confidence, and did it pass the no-default guard.*

## 8. Unknown handling

- A metric that is configured but not fetched = **unavailable**, never `$0` /
  empty / 0 / healthy.
- Convert missing telemetry into `unknown`, not a fabricated value.
- Label the card "unavailable" and route to human text on personal channels.