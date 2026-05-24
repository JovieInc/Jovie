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
