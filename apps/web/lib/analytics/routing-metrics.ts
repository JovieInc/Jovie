/**
 * Pure aggregation over /api/track click metadata carrying routing telemetry
 * (clickId, ttdMs, storefront, visitorCountry). Feeds Ovie/dashboard tiles.
 */
export interface RoutingClickRow {
  readonly provider?: string;
  readonly ttdMs?: number;
  readonly storefront?: string;
  readonly visitorCountry?: string;
}

export interface RoutingMetrics {
  readonly clicks: number;
  readonly ttdP50Ms: number | null;
  readonly ttdP95Ms: number | null;
  /** Share of Apple Music clicks whose storefront equals the visitor country. */
  readonly correctStorefrontRate: number | null;
  readonly appleClicksWithCountry: number;
}

export function percentile(
  sorted: readonly number[],
  p: number
): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)] ?? null;
}

export function summarizeRoutingMetrics(
  rows: readonly RoutingClickRow[]
): RoutingMetrics {
  const ttds = rows
    .map(r => r.ttdMs)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  const apple = rows.filter(
    r => r.provider === 'apple_music' && r.storefront && r.visitorCountry
  );
  const correct = apple.filter(r => r.storefront === r.visitorCountry).length;
  return {
    clicks: rows.length,
    ttdP50Ms: percentile(ttds, 50),
    ttdP95Ms: percentile(ttds, 95),
    correctStorefrontRate: apple.length ? correct / apple.length : null,
    appleClicksWithCountry: apple.length,
  };
}
