import { computeRatePercent } from '@/lib/analytics/metrics';

/** Shared metric sample shape for the section-8 projection. */
export interface MetricValue {
  /** Null when the denominator is empty — never a fake zero. */
  readonly value: number | null;
  readonly sampleSize: number;
}

const MINUTES_PER_MS = 1 / 60_000;

export function minutesBetween(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) * MINUTES_PER_MS);
}

export function metric(value: number | null, sampleSize: number): MetricValue {
  return { value, sampleSize };
}

export function rate(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return metric(null, 0);
  return metric(numerator / denominator, denominator);
}

export function per100(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return metric(null, 0);
  // Canonical per-100 rate derivation (analytics-metrics-layer guard).
  return metric(computeRatePercent(numerator, denominator), denominator);
}

export function percentile(
  sorted: readonly number[],
  p: number
): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}
