export function medianNumber(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const low = sorted[mid - 1];
    const high = sorted[mid];
    if (low !== undefined && high !== undefined) return (low + high) / 2;
  }
  return sorted[mid] ?? null;
}
