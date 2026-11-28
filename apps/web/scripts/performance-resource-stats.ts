/**
 * Pure helpers for the performance budgets guard: sample statistics, metric
 * formatting, and naming the heaviest requests behind a failed size budget.
 * Kept apart from the guard so it stays within its size budget.
 */

export type SizedResourceType = 'font' | 'image' | 'script' | 'stylesheet';

/** One request as the browser reported it, before redaction. */
export interface SizedResource {
  readonly type: SizedResourceType;
  readonly url: string;
  readonly size: number;
}

export interface LargestResource {
  /** Origin and path only; query strings and fragments are dropped. */
  readonly url: string;
  readonly kb: number;
}

export type LargestResources = Partial<
  Record<SizedResourceType, readonly LargestResource[]>
>;

const LARGEST_RESOURCE_COUNT = 3;

export function formatMetric(value: number, unit: '' | 'KB' | 'ms') {
  return `${value.toFixed(1)}${unit}`;
}

export function medianNumber(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

/**
 * Nearest-rank percentile (ceil(rank) into the ascending-sorted values),
 * matching the estimator named in
 * docs/performance/public-profile-alias-graduation.json (`p95Estimator:
 * nearest-rank`). At 5 samples the 95th rank is the 5th of 5, i.e. the
 * maximum — one environmental cold-start decides the gate; at 20 samples it
 * is the 19th of 20 and tolerates exactly one such outlier.
 */
export function nearestRankPercentile(
  values: readonly number[],
  percentile: number
) {
  if (values.length === 0) {
    throw new TypeError('Percentile of an empty sample set is undefined.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/** Drop the query string and fragment, which can carry signed tokens. */
export function redactResourceUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split(/[?#]/u)[0] ?? '';
  }
}

function heaviest(
  entries: readonly { url: string; kb: number }[]
): LargestResource[] {
  return entries
    .filter(entry => entry.kb > 0)
    .sort((left, right) => right.kb - left.kb)
    .slice(0, LARGEST_RESOURCE_COUNT);
}

/** The heaviest requests of each type, redacted, in KB. */
export function largestResourcesByType(
  resources: readonly SizedResource[] = []
): LargestResources {
  const byType: Record<SizedResourceType, { url: string; kb: number }[]> = {
    font: [],
    image: [],
    script: [],
    stylesheet: [],
  };
  for (const resource of resources) {
    byType[resource.type].push({
      url: redactResourceUrl(resource.url),
      kb: resource.size / 1024,
    });
  }
  return {
    font: heaviest(byType.font),
    image: heaviest(byType.image),
    script: heaviest(byType.script),
    stylesheet: heaviest(byType.stylesheet),
  };
}

/**
 * Name the heaviest requests behind a failed size budget, from the last sample
 * that recorded them, so the gate says what to cut instead of only how much.
 */
export function formatLargestResources(
  samples: readonly { readonly largestResources?: LargestResources }[],
  metricName: string
): string[] {
  const recorded = samples
    .map(sample => sample.largestResources)
    .filter((entry): entry is LargestResources => Boolean(entry))
    .at(-1);
  if (!recorded) return [];
  const entries =
    metricName === 'total'
      ? heaviest(Object.values(recorded).flatMap(list => list ?? []))
      : (recorded[metricName as SizedResourceType] ?? []);
  return entries.map(
    entry => `      ${formatMetric(entry.kb, 'KB')} ${entry.url}`
  );
}
