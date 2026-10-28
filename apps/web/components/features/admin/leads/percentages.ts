export function clampPercentValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getClampedPercent(
  numerator: number,
  denominator: number
): number {
  if (denominator <= 0) return 0;
  return clampPercentValue(Math.round((numerator / denominator) * 100));
}

export function formatClampedPercent(
  value: number | null,
  precision = 1
): string {
  if (value === null) return '--';
  return `${clampPercentValue(value * 100).toFixed(precision)}%`;
}

/**
 * Display label for a count as a share of a total. Never rounds a non-zero
 * count to "0%" (shows "<1%") nor a partial share to "100%" (shows ">99%").
 */
export function formatSharePercent(
  numerator: number,
  denominator: number
): string {
  if (denominator <= 0) return '--';
  const pct = getClampedPercent(numerator, denominator);
  if (pct === 0 && numerator > 0) return '<1%';
  if (pct === 100 && numerator < denominator) return '>99%';
  return `${pct}%`;
}
