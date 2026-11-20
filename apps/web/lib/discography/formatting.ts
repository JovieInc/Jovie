import { COPY_FALLBACKS } from '@/data/copyFallbacks';

const longReleaseDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortReleaseDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthYearReleaseDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const releaseArtistListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

/**
 * ONE canonical formatter for release credit lists (ds-cert:credit-format).
 *
 * Every surface that renders a list of artist/credit names for a release —
 * release list/table cells, release drawer/sidebar headers, release landing
 * pages, smart-link surfaces — formats through this module (or the CreditList
 * molecule built on it) and never joins credit names locally. The
 * source-contract test tests/unit/design-system/release-credit-list-format.test.ts
 * guards this.
 *
 * House style is the Oxford-less conjunction already seen in the release
 * drawer: "Vigel and Tim White", "A, B and C". Long lists truncate to
 * "A, B and N more" and callers expose the full list via title/aria-label.
 */

/**
 * Intl.ListFormat('en') emits an Oxford comma before the final conjunction
 * ("A, B, and C"). The house style is Oxford-less, so the leading comma is
 * stripped from conjunction literals while separators (", ") stay intact.
 */
const CONJUNCTION_LITERAL_COMMA_RE = /^,\s*(?:and|or|nor|but)\s/i;

function toOxfordLessLiteral(value: string): string {
  return CONJUNCTION_LITERAL_COMMA_RE.test(value) ? value.slice(1) : value;
}

/**
 * Trim names, drop empty entries, and drop exact duplicate names (first
 * occurrence wins, order preserved). Display-only: the underlying release
 * data is never rewritten — duplicate/ISRC cleanup belongs to the catalog
 * worker.
 */
function normalizeReleaseCreditNames(
  names: readonly string[] | undefined
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

function formatOxfordLessParts(
  normalizedNames: readonly string[]
): Array<{ type: 'element' | 'literal'; value: string }> {
  return releaseArtistListFormatter
    .formatToParts(normalizedNames)
    .map(part => ({
      type:
        part.type === 'element' ? ('element' as const) : ('literal' as const),
      value:
        part.type === 'literal' ? toOxfordLessLiteral(part.value) : part.value,
    }));
}

export function parseReleaseDate(date: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ReleaseArtistLinePart =
  | { readonly type: 'element'; readonly value: string }
  | { readonly type: 'literal'; readonly value: string };

export function formatReleaseArtistLine(
  artistNames: readonly string[] | undefined,
  fallbackArtistName?: string | null
): string | null {
  const normalizedNames = normalizeReleaseCreditNames(artistNames);

  if (normalizedNames.length > 0) {
    return formatOxfordLessParts(normalizedNames)
      .map(part => part.value)
      .join('');
  }

  const fallback = fallbackArtistName?.trim();
  return fallback || null;
}

export function formatReleaseArtistLineParts(
  artistNames: readonly string[] | undefined
): ReleaseArtistLinePart[] {
  const normalizedNames = normalizeReleaseCreditNames(artistNames);

  if (normalizedNames.length === 0) {
    return [];
  }

  return formatOxfordLessParts(normalizedNames);
}

export function formatCompactReleaseArtistLine(
  artistNames: readonly string[] | undefined,
  fallbackArtistName: string | null | undefined,
  maxVisibleArtists = 2
): string | null {
  const normalizedNames = normalizeReleaseCreditNames(artistNames);

  if (normalizedNames.length === 0) {
    const fallback = fallbackArtistName?.trim();
    return fallback || null;
  }

  if (normalizedNames.length <= maxVisibleArtists) {
    return formatReleaseArtistLine(normalizedNames);
  }

  const visibleNames = normalizedNames.slice(0, maxVisibleArtists);
  const remainingCount = normalizedNames.length - maxVisibleArtists;
  return `${visibleNames.join(', ')} and ${remainingCount} more`;
}

export function formatReleaseDate(date: string | undefined): string {
  if (!date) return COPY_FALLBACKS.date;
  const parsed = parseReleaseDate(date);
  return parsed ? longReleaseDateFormatter.format(parsed) : 'Invalid date';
}

export function formatReleaseDateShort(date: string | undefined): string {
  if (!date) return COPY_FALLBACKS.date;
  const parsed = parseReleaseDate(date);
  return parsed ? shortReleaseDateFormatter.format(parsed) : 'Invalid';
}

export function formatReleaseDateMonthYear(date: string | undefined): string {
  if (!date) return COPY_FALLBACKS.date;
  const parsed = parseReleaseDate(date);
  return parsed ? monthYearReleaseDateFormatter.format(parsed) : 'Invalid';
}
