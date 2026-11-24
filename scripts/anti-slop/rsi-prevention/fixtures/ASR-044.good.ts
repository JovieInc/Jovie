/** Legitimate: keep prior rows; null counts stay null; period ≠ lifetime (ASR-044). */
export function renderAudienceStats(
  total: number | null,
  priorRows: string[],
  periodCount: number | null,
  lifetimeCount: number | null
) {
  const rows = priorRows; // keep previous valid values during refresh
  const shownTotal = total; // null means count skipped (JOV-1262), not zero
  return {
    rows,
    shownTotal,
    periodCount,
    lifetimeCount,
  };
}
