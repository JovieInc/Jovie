import { FEATURED_REASON_CODES, type FeaturedReasonCode } from './engine';

const KINDS = ['release', 'show', 'merch', 'tip', 'listen'] as const;
const CHANNELS = ['dsp', 'social', 'search', 'direct', 'other'] as const;

/** Events that move the counters; everything else is ignored. */
export const FEATURED_COUNTED_EVENTS = [
  'pac_exposure',
  'featured_tap',
] as const;

export interface FeaturedCounterKey {
  readonly kind: (typeof KINDS)[number];
  readonly reason: FeaturedReasonCode;
  readonly channel: (typeof CHANNELS)[number];
}

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown
): T | null {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Validates the featured_* extras on a PAC beacon against the engine
 * allow-lists. Anything unknown returns null, so the counters can only ever
 * hold values the engine can produce.
 */
export function parseFeaturedExtras(
  extras: Readonly<Record<string, string | number | boolean>> | undefined
): FeaturedCounterKey | null {
  if (!extras) return null;
  const kind = pick(KINDS, extras.featured_kind);
  const reason = pick(FEATURED_REASON_CODES, extras.featured_reason);
  const channel = pick(CHANNELS, extras.featured_channel);
  return kind && reason && channel ? { kind, reason, channel } : null;
}

export interface FeaturedCounterRow {
  readonly kind: string;
  readonly reason: string;
  readonly impressions: number;
  readonly taps: number;
}

export interface FeaturedReportLine extends FeaturedCounterRow {
  /** null until the line has enough impressions to read a rate. */
  readonly tapRate: number | null;
  readonly underpowered: boolean;
}

export const FEATURED_MIN_IMPRESSIONS = 100;

/** Folds counter rows into one line per kind and reason, busiest first. */
export function buildFeaturedReport(
  rows: readonly FeaturedCounterRow[]
): FeaturedReportLine[] {
  const merged = new Map<string, FeaturedCounterRow>();
  for (const row of rows) {
    const key = `${row.kind}|${row.reason}`;
    const current = merged.get(key);
    merged.set(key, {
      kind: row.kind,
      reason: row.reason,
      impressions: (current?.impressions ?? 0) + row.impressions,
      taps: (current?.taps ?? 0) + row.taps,
    });
  }
  return [...merged.values()]
    .map(line => {
      const underpowered = line.impressions < FEATURED_MIN_IMPRESSIONS;
      return {
        ...line,
        underpowered,
        tapRate: underpowered ? null : line.taps / line.impressions,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}
