import type { AdminActivityItem } from '@/lib/admin/overview';

/**
 * Case-insensitive event search over the company activity timeline
 * (JOV-5312). Matches actor, action, and status so `/hud` event drill-downs
 * land on filtered authoritative records.
 */
export function filterAdminActivityItems(
  items: readonly AdminActivityItem[],
  query: string
): AdminActivityItem[] {
  const normalize = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ');
  const needle = normalize(query);
  if (!needle) return [...items];
  return items.filter(item =>
    normalize(`${item.user} ${item.action} ${item.status}`).includes(needle)
  );
}
