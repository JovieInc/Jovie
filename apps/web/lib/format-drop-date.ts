/**
 * Tone bucket returned alongside the drop-date label. Consumers map this
 * to a chip color: `past` is muted neutral, `soon` is amber, `future` is
 * the calm default surface.
 */
export type DropDateTone = 'past' | 'soon' | 'future';

/**
 * Format a release drop date as `{ label, tone }` for use with the
 * `DropDateChip` primitive (or any drop-date status surface). The label
 * mirrors English release-calendar phrasing:
 *
 * - past >1 day → `"Nd ago"` (past)
 * - past 1 day → `"Yesterday"` (past)
 * - today → `"Today"` (soon)
 * - tomorrow → `"Tomorrow"` (soon)
 * - within a week → `"Drops in Nd"` (soon)
 * - within a month → `"Drops in Nd"` (future)
 * - beyond a month → localised absolute `"Drops Apr 27"` (future)
 *
 * `now` defaults to `new Date()`. Pass a fixed instant for snapshot tests
 * or fixed-time previews.
 *
 * @example
 * dropDateMeta('2026-04-30', new Date('2026-04-25'))
 * // { label: 'Drops in 5d', tone: 'soon' }
 *
 * dropDateMeta('2026-04-22', new Date('2026-04-25'))
 * // { label: '3d ago', tone: 'past' }
 */
export function dropDateMeta(
  iso: string,
  now: Date = new Date()
): { label: string; tone: DropDateTone } {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return { label: '', tone: 'future' };
  const days = Math.round(ms / 86400000);
  if (days < -1) return { label: `${Math.abs(days)}d ago`, tone: 'past' };
  if (days === -1) return { label: 'Yesterday', tone: 'past' };
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days <= 7) return { label: `Drops in ${days}d`, tone: 'soon' };
  if (days <= 30) return { label: `Drops in ${days}d`, tone: 'future' };
  return {
    label: `Drops ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    tone: 'future',
  };
}
