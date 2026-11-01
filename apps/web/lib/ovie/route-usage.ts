import { APP_ROUTES } from '@/constants/routes';

/**
 * Ovie route usage: which operator destinations Tim actually opens. The
 * measurement exists so a page is deleted or merged on evidence, never on a
 * guess (Tim 2026-10-25: measure everything). Keys are route templates only,
 * never ids, queries or user data.
 */
export const OVIE_ROUTE_USAGE_RETENTION_DAYS = 100;
export const OVIE_ROUTE_USAGE_DEFAULT_WINDOW_DAYS = 30;

const OV_PREFIXES = [APP_ROUTES.OV, APP_ROUTES.LEGACY_ADMIN] as const;
/** Second segments whose third segment is an id, never a destination. */
const ID_PARENTS = new Set(['lists', 'agent-runs', 'wiki']);

/**
 * Canonical route key for a pathname, or null for non-Ovie paths.
 * `/app/ov` is `home`; `/app/ov/people?view=x` is `people`; `/app/ov/lists/ab12`
 * is `lists`.
 */
export function ovieRouteKey(
  pathname: string | null | undefined
): string | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/, 1)[0] ?? '';
  const prefix = OV_PREFIXES.find(
    candidate => path === candidate || path.startsWith(`${candidate}/`)
  );
  if (!prefix) return null;
  const segments = path
    .slice(prefix.length)
    .split('/')
    .filter(Boolean)
    .map(segment => segment.toLowerCase());
  if (segments.length === 0) return 'home';
  const [first, second] = segments;
  if (!first || !/^[a-z][a-z0-9-]{0,40}$/.test(first)) return null;
  if (
    second &&
    !ID_PARENTS.has(first) &&
    /^[a-z][a-z0-9-]{0,40}$/.test(second)
  ) {
    return `${first}/${second}`;
  }
  return first;
}

export function ovieUsageDayKey(date: Date): string {
  return `ovie:route-usage:v1:${date.toISOString().slice(0, 10)}`;
}

export interface OvieRouteUsageRow {
  readonly route: string;
  readonly views: number;
  readonly lastDay: string;
}

export function summarizeRouteUsage(
  days: readonly {
    readonly day: string;
    readonly counts: Readonly<Record<string, number>>;
  }[]
): readonly OvieRouteUsageRow[] {
  const totals = new Map<string, { views: number; lastDay: string }>();
  for (const { day, counts } of days) {
    for (const [route, views] of Object.entries(counts)) {
      if (!Number.isFinite(views) || views <= 0) continue;
      const row = totals.get(route) ?? { views: 0, lastDay: day };
      row.views += views;
      if (day > row.lastDay) row.lastDay = day;
      totals.set(route, row);
    }
  }
  return [...totals.entries()]
    .map(([route, row]) => ({ route, ...row }))
    .sort((a, b) => b.views - a.views || a.route.localeCompare(b.route));
}
