/**
 * Dashboard color semantics (ASR-041).
 *
 * Three color jobs, never mixed:
 * - Accent marks the primary action, the current selection, focus and links.
 *   It never paints a data value, a chart series or a decorative icon.
 * - Status colors (success, warning, error) say whether something is healthy.
 *   A tone like `good` / `warn` / `bad` belongs to a status dot or badge.
 * - A delta is colored by its sentiment: the direction it moved combined with
 *   the metric's polarity. "Up" is green only when higher is better. A flat
 *   delta, or a metric with no polarity, stays neutral.
 *
 * Delta and status colors use the `-text` tokens, which hold contrast in light
 * and dark. The bare status fills (neon mint and red) fail on white.
 */

export type MetricPolarity = 'higher-is-better' | 'lower-is-better' | 'neutral';
export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaSentiment = 'positive' | 'negative' | 'neutral';

export function directionOf(delta: number): DeltaDirection {
  if (!Number.isFinite(delta) || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/**
 * Reads the direction from a formatted delta such as `+3`, `-16`, `−2.1%`,
 * `0%` or `flat`. Returns null when the label carries no direction (for
 * example `alive`), so callers keep their own fallback.
 */
export function directionOfLabel(label: string): DeltaDirection | null {
  const trimmed = label.trim();
  if (trimmed === 'flat' || /^[-−+]?0+(?:\.0+)?%?$/u.test(trimmed))
    return 'flat';
  if (/^[-−]\d/u.test(trimmed)) return 'down';
  if (/^\+\d/u.test(trimmed)) return 'up';
  return null;
}

export function deltaSentiment(
  direction: DeltaDirection,
  polarity: MetricPolarity
): DeltaSentiment {
  if (direction === 'flat' || polarity === 'neutral') return 'neutral';
  const improved =
    polarity === 'higher-is-better' ? direction === 'up' : direction === 'down';
  return improved ? 'positive' : 'negative';
}

export function parsePolarity(value: unknown): MetricPolarity {
  if (value === 'lower-is-better' || value === 'neutral') return value;
  if (value === false) return 'lower-is-better';
  return 'higher-is-better';
}

export const DELTA_TEXT_CLASS: Readonly<Record<DeltaSentiment, string>> = {
  positive: 'text-success-text',
  negative: 'text-error-text',
  neutral: 'text-tertiary-token',
};

export const DELTA_STROKE: Readonly<Record<DeltaSentiment, string>> = {
  positive: 'var(--color-success-text)',
  negative: 'var(--color-error-text)',
  neutral: 'var(--color-text-tertiary-token)',
};

export const DELTA_FILL: Readonly<Record<DeltaSentiment, string>> = {
  positive: 'color-mix(in oklab, var(--color-success-text) 12%, transparent)',
  negative: 'color-mix(in oklab, var(--color-error-text) 12%, transparent)',
  neutral:
    'color-mix(in oklab, var(--color-text-tertiary-token) 8%, transparent)',
};

/**
 * Chart series colors. Data is neutral: one series reads in the secondary
 * text tone; an ordered set (a funnel) steps from quiet to bright, so the
 * last stage reads strongest without borrowing accent or status hues.
 */
export const DATA_SERIES = {
  primary: 'var(--color-text-secondary-token)',
  ordered: [
    'var(--color-text-quaternary-token)',
    'var(--color-text-tertiary-token)',
    'var(--color-text-secondary-token)',
    'var(--color-text-primary-token)',
  ],
} as const;
