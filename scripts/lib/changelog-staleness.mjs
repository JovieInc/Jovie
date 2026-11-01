/**
 * Customer changelog staleness: release-worthy changes that are live in
 * production but have no published entry more than `thresholdHours` later.
 * Pure so the Production Controller job and tests share one definition.
 */
export const CHANGELOG_STALE_HOURS = 24;

/**
 * @param {{ liveWorthy: { number: number, mergedAt: string }[], lastPublishedAt: string | null, now: string, thresholdHours?: number }} input
 */
export function evaluateChangelogStaleness({
  liveWorthy,
  lastPublishedAt,
  now,
  thresholdHours = CHANGELOG_STALE_HOURS,
}) {
  const nowMs = Date.parse(now);
  const publishedMs = lastPublishedAt ? Date.parse(lastPublishedAt) : 0;
  const waiting = liveWorthy
    .map(pr => ({ number: pr.number, mergedMs: Date.parse(pr.mergedAt) }))
    .filter(pr => Number.isFinite(pr.mergedMs) && pr.mergedMs > publishedMs)
    .sort((a, b) => a.mergedMs - b.mergedMs);
  if (!waiting.length) return { status: 'ok', waiting: 0, ageHours: 0 };
  const ageHours = (nowMs - waiting[0].mergedMs) / 3_600_000;
  return {
    status: ageHours > thresholdHours ? 'stale' : 'ok',
    waiting: waiting.length,
    ageHours: Math.round(ageHours * 10) / 10,
    oldestPr: waiting[0].number,
  };
}
