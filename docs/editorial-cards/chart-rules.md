# Chart Rules

Status: **Draft (research lane)** · Owner: Gem · Updated 2026-08-10

Rules for the `trend` card (and any chart inside a card). Specifics required by
the brief: **7-day daily buckets, Pacific timezone, smoothing that never invents
data, electric-blue palette, accessible fallback.**

## 1. Buckets

- **7-day daily buckets** by default for the shipping trend card. Each bucket is
  one Pacific calendar day.
- Bucket boundaries are Pacific-midnight to Pacific-midnight
  (`America/Los_Angeles`), converted to UTC for the query.
- Bucket label shows the Pacific date (e.g. "Mon Aug 4 … Sun Aug 10").
- Bucket key (idempotency): `(sourceKey, dayStartUtc, dayEndUtc)` per day.

## 2. Timezone

- Chart time axis is **Pacific local time** (`America/Los_Angeles`), never UTC
  labels, never the server's local zone.
- The chart header states the window: "Last 7 days (Pacific)".
- Note DST: Pacific midnight still maps through the correct UTC offset for that
  date; compute per-day, not from a single fixed offset.

## 3. Smoothing that never invents data

- **Constraint:** smoothing is for legibility only and **must not invent,
  extrapolate, or hallucinate** data points.
- **Allowed:** a **centered moving average over real buckets** (e.g. 3-point CMA,
  `smoothing: "cma3"`), computed only from observed daily values. It repositions
  real points; it does not add unobserved days.
- **Allowed:** a monotonic knot-preserving / shape-preserving fit through the
  observed buckets (guarantees no overshoot beyond observed range).
- **Forbidden:**
  - No extrapolation beyond the last observed bucket.
  - No regression that predicts values the source did not report.
  - No filling missing days with averages (mark a missing day as a gap, do not
    smooth across it as if it were a real value).
- **Gap handling:** a missing day renders as a visible gap (or a dotted segment),
  never as a smoothed interpolation pretending data exists.
- The smoothing parameter is part of the `CardContract.layout` (e.g.
  `smoothing: "cma3"`), so it is auditable and versioned.

## 4. Electric-blue palette

- Accent color = the canonical Noir Ion electric blue **`#11afff`** (`accent.ion`,
  `feature.analytics` in `design.tokens.json`).
- Chart line: electric-blue `#11afff` on the dark canvas (`#030407`).
- Grid/axis: subtle cool-graphite (e.g. `oklch(100% 0 0 / ~12%)`), not white.
- Optional secondary series: use another approved accent (e.g. aqua `#24f6d2`,
  mint `#39e58c`) never a new ad-hoc color.
- No brand-new colors; reuse the token set.

## 5. Accessible fallback

- **The trend card must work without the chart.** Provide an accessible fallback:
  - A tabular rendering of the 7 daily buckets (date + value) — always present
    in the text target and as a caption on the PNG/web target.
  - Or a line-chart `<svg>` with real `<title>` / `<text>` labels and adequate
    color contrast (electric blue on `#030407` passes WCAG AA for large text /
    graphical objects).
- `prefers-reduced-motion`: no animation on the chart (static line, no draw-in).
- The accessible table is not optional; it is part of every `trend` card.

## 6. Chart data contract (in `CardData`)

```ts
interface TrendSeries {
  readonly metricId: string;
  readonly unit?: string | null;
  readonly buckets: readonly TrendBucket[];
  readonly smoothing: 'none' | 'cma3' | 'cma5' | string: null;
  readonly timezone: string; // "America/Los_Angeles"
}

interface TrendBucket {
  readonly dayStartUtc: string; // ISO-8601 UTC (Pacific midnight)
  readonly dayEndUtc: string;   // ISO-8601 UTC (next Pacific midnight)
  readonly label: string;       // "Mon Aug 4"
  readonly value: number | null; // null = missing day (gap)
  readonly isFuture: boolean;   // true for today's in-progress bucket
}
```

- The last bucket (today) is partial/in-progress and must be labeled as such
  (e.g. "today so far") rather than presented as a complete day.

## 7. Summary

| Rule | Requirement |
|------|-------------|
| Buckets | 7 daily Pacific buckets |
| Timezone | `America/Los_Angeles`, per-day DST-aware |
| Smoothing | CMA over real buckets only; no extrapolation/invention |
| Gaps | render as gap, never fake interpolated value |
| Palette | electric blue `#11afff` on dark canvas; reuse tokens |
| Accessibility | tabular fallback always present; reduced-motion respected |
| Today bucket | labeled in-progress/partial, not a complete day |
| Smoothing param | versioned in `CardContract.layout` |