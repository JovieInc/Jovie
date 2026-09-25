/** RevenueCat's daily MRR for LogYourBody, never a cash receipt. */
export interface LybDailyMrr {
  schema: 'jovie.lyb-daily-mrr/v1';
  product: 'logyourbody';
  definition: 'active-paid-subscriptions-monthly-normalized-gross';
  currency: 'USD';
  asOfDate: string | null;
  observedAt: string | null;
  freshnessDeadline: string | null;
  source: {
    provider: 'revenuecat';
    metric: 'mrr';
    projectId: string;
    revision: string;
  } | null;
  state: 'fresh' | 'stale' | 'unavailable' | 'unreconciled';
  mrrCents: number | null;
}

const MAX_AGE_MS = 36 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The options endpoint, not a hard-coded resolution ID, defines "day". */
export function parseLybMrrDayResolution(input: unknown): string {
  if (
    !isRecord(input) ||
    input.object !== 'chart_options' ||
    !Array.isArray(input.resolutions)
  ) {
    throw new Error('RevenueCat MRR chart options malformed');
  }
  const day = input.resolutions.filter(
    item =>
      isRecord(item) &&
      item.display_name === 'day' &&
      typeof item.id === 'string' &&
      item.id.length > 0
  );
  if (day.length !== 1 || !isRecord(day[0])) {
    throw new Error('RevenueCat MRR day resolution unavailable');
  }
  return day[0].id as string;
}

function onlyPoint(values: unknown): number {
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error('RevenueCat MRR chart has ambiguous series');
  }
  const series = values[0];
  if (!Array.isArray(series) || series.length !== 1) {
    throw new Error('RevenueCat MRR chart has ambiguous daily points');
  }
  const point = series[0];
  if (
    typeof point !== 'number' ||
    !Number.isFinite(point) ||
    point < 0 ||
    !Number.isSafeInteger(Math.round(point * 100))
  ) {
    throw new Error('RevenueCat MRR chart value malformed');
  }
  return point;
}

/** One UTC day, one unsegmented gross USD point, with provider computation time. */
export function parseLybMrrChart(
  input: unknown,
  projectId: string,
  asOfDate: string,
  now: Date,
  dayResolution: string
): LybDailyMrr {
  const dayStart = Date.parse(`${asOfDate}T00:00:00.000Z`);
  if (
    !Number.isFinite(dayStart) ||
    new Date(dayStart).toISOString().slice(0, 10) !== asOfDate ||
    !isRecord(input) ||
    input.object !== 'chart_data' ||
    input.category !== 'revenue' ||
    !dayResolution ||
    input.resolution !== dayResolution ||
    input.yaxis_currency !== 'USD' ||
    input.yaxis !== '$' ||
    !Number.isSafeInteger(input.last_computed_at) ||
    !Number.isSafeInteger(input.start_date) ||
    !Number.isSafeInteger(input.end_date)
  ) {
    throw new Error('RevenueCat daily MRR chart malformed');
  }
  const computedMs = input.last_computed_at as number;
  if (
    computedMs < dayStart ||
    computedMs > now.getTime() ||
    input.start_date !== dayStart ||
    input.end_date !== dayStart ||
    (input.segments != null &&
      (!Array.isArray(input.segments) || input.segments.length !== 0)) ||
    (input.user_selectors != null &&
      (!isRecord(input.user_selectors) ||
        Object.keys(input.user_selectors).length !== 1 ||
        input.user_selectors.revenue_type !== 'revenue'))
  ) {
    throw new Error('RevenueCat daily MRR chart scope ambiguous');
  }
  const value = onlyPoint(input.values);
  const observedAt = new Date(computedMs).toISOString();
  const freshnessDeadline = new Date(computedMs + MAX_AGE_MS).toISOString();
  const fresh = now.getTime() <= computedMs + MAX_AGE_MS;
  return {
    schema: 'jovie.lyb-daily-mrr/v1',
    product: 'logyourbody',
    definition: 'active-paid-subscriptions-monthly-normalized-gross',
    currency: 'USD',
    asOfDate,
    observedAt,
    freshnessDeadline,
    source: {
      provider: 'revenuecat',
      metric: 'mrr',
      projectId,
      revision: String(computedMs),
    },
    state: fresh ? 'fresh' : 'stale',
    mrrCents: fresh ? Math.round(value * 100) : null,
  };
}
