/**
 * Format an ISO date relative to `now`, returning short English phrasing.
 * Past: `"3d ago"` / `"Yesterday"` / `"Just now"`. Future: `"in 3d"` /
 * `"Tomorrow"` / `"Today"`. Beyond a week, falls back to a localised
 * `"Apr 27"`-style absolute date.
 *
 * `now` defaults to `new Date()` so the function is deterministic-by-call —
 * pass a fixed instant for snapshot tests, fixed-time previews, or design
 * sandboxes that need stable output across reloads.
 *
 * @example
 * relativeDate('2026-04-25', new Date('2026-04-26'))  // "Yesterday"
 * relativeDate('2026-04-30', new Date('2026-04-25'))  // "in 5d"
 */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return '';
  const days = Math.round(ms / 86400000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days === 1) return 'Tomorrow';
  if (days < 0 && days >= -7) return `${Math.abs(days)}d ago`;
  if (days > 0 && days <= 7) return `in ${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
