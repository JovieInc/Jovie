import type { HomeLoopTone } from '@/lib/home-loop/contract';
import type { CountMeasurement } from '@/lib/ovie/shipping-state/contract';
export function toneAtMost(
  value: number,
  target: number,
  badAbove: number
): HomeLoopTone {
  if (value <= target) return 'good';
  return value > badAbove ? 'bad' : 'warn';
}

export function toneAtLeast(value: number, target: number): HomeLoopTone {
  if (value >= target) return 'good';
  return value < target / 2 ? 'bad' : 'warn';
}

export function perDay(measurement: CountMeasurement): number | null {
  const week = measurement.state === 'not-measured' ? null : measurement.value;
  return week === null ? null : Math.round(week / 7);
}

export function shippingSnapshotCaption(at: string | null | undefined): string {
  const timestamp = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(timestamp)
    ? `Snapshot ${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : 'Snapshot time unknown';
}
