/**
 * Discography section rendering for the chat system prompt.
 *
 * Extracted from system-prompt.ts (whole-file size ratchet). Owns the
 * release-timing helpers and the catalog-aware discography block:
 * known dates first, true total vs loaded vs shown counts, and explicit
 * truncated/unavailable states so a partial read can never render as
 * "no releases exist" (dogfood 2026-11-10).
 */
import { promptListItem } from './prompt-list-item';
import type { ReleaseCatalogMeta } from './types';

/** Structural shape both ReleasePromptContext and ReleaseContext satisfy. */
interface DiscographyRelease {
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly totalTracks: number;
}

/** Rows of the discography rendered in the prompt before truncation. */
export const DISCOGRAPHY_PROMPT_ROW_LIMIT = 25;

const DAY_MS = 86_400_000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function weekday(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** "2026-10-30 (Friday)" */
export function formatPromptDate(date: Date): string {
  return `${date.toISOString().slice(0, 10)} (${weekday(date)})`;
}

/**
 * Upcoming vs released, relative to today. Without this the model treats a
 * single due Friday as already out (helpfulness eval, 2026-10-28).
 */
export function describeReleaseTiming(
  releaseDate: string | null,
  now: Date
): string {
  if (!releaseDate) return 'date not set';
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return 'date not set';
  const days = Math.round((utcDay(date) - utcDay(now)) / DAY_MS);
  if (days > 0) {
    return `UPCOMING, out ${weekday(date)} ${releaseDate.slice(0, 10)}, in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (days === 0) return `OUT TODAY, ${releaseDate.slice(0, 10)}`;
  const ago = -days;
  return `released ${releaseDate.slice(0, 10)}, ${ago} day${ago === 1 ? '' : 's'} ago`;
}

function formatReleaseLine(release: DiscographyRelease, now: Date): string {
  const trackLabel = release.totalTracks === 1 ? 'track' : 'tracks';
  return promptListItem(
    `${release.title} (${release.releaseType}, ${release.totalTracks} ${trackLabel}; ${describeReleaseTiming(release.releaseDate, now)})`
  );
}

/** Titles named this turn that are absent from the shown rows. No new heading. */
function namedReleaseBlock(
  named: readonly DiscographyRelease[] | undefined,
  shown: readonly DiscographyRelease[],
  now: Date
): string {
  if (!named || named.length === 0) return '';
  const shownTitles = new Set(
    shown
      .slice(0, DISCOGRAPHY_PROMPT_ROW_LIMIT)
      .map(release => release.title.toLowerCase())
  );
  const lines = named
    .filter(release => !shownTitles.has(release.title.toLowerCase()))
    .slice(0, 3)
    .map(release => formatReleaseLine(release, now));
  if (lines.length === 0) return '';
  return [
    promptListItem('Named this turn, resolved from the full catalog:'),
    ...lines,
  ].join('\n');
}

/**
 * The `- **Total Releases:** …` fact line. Distinct total / loaded / shown
 * counts whenever catalog metadata is supplied; the legacy loaded-count
 * rendering when it is not, so eval fixtures stay byte-stable.
 */
export function discographyTotalLine(
  releases: readonly DiscographyRelease[],
  catalog?: ReleaseCatalogMeta
): string {
  if (catalog?.status === 'unavailable') {
    return 'unknown (catalog temporarily unavailable)';
  }
  if (!catalog) return String(releases.length);
  const total = catalog.total ?? releases.length;
  return `${total} (${releases.length} loaded, ${Math.min(
    releases.length,
    DISCOGRAPHY_PROMPT_ROW_LIMIT
  )} shown)`;
}

export function buildDiscographySection(
  releases: readonly DiscographyRelease[],
  now: Date,
  catalog?: ReleaseCatalogMeta,
  namedReleases?: readonly DiscographyRelease[]
): string {
  if (catalog?.status === 'unavailable') {
    return [
      promptListItem('The release catalog could not be read this turn.'),
      promptListItem(
        'Do not say the artist has no releases and do not guess a release count. If asked, say the catalog is temporarily unavailable and to try again shortly.'
      ),
    ].join('\n');
  }

  if (releases.length === 0) {
    const named = namedReleaseBlock(namedReleases, releases, now);
    return (
      named ||
      promptListItem('No releases found in the connected discography yet.')
    );
  }

  const total = catalog?.total ?? releases.length;
  const releaseLines = releases
    .slice(0, DISCOGRAPHY_PROMPT_ROW_LIMIT)
    .map(release => formatReleaseLine(release, now))
    .join('\n');
  const overflowCount = total - DISCOGRAPHY_PROMPT_ROW_LIMIT;
  const releasePlural = overflowCount === 1 ? '' : 's';
  const overflowBody = catalog
    ? `...and ${overflowCount} more release${releasePlural} in the catalog (${total} total, ${DISCOGRAPHY_PROMPT_ROW_LIMIT} most recent shown).`
    : `...and ${overflowCount} more release${releasePlural} in the catalog.`;
  const overflowLine =
    overflowCount > 0 ? `\n${promptListItem(overflowBody)}` : '';
  // Fires whenever the prompt list itself is truncated, not only when the
  // catalog extends beyond the loaded slice: the 26th+ loaded release is
  // equally invisible to the model.
  const truncationNote =
    releases.length > DISCOGRAPHY_PROMPT_ROW_LIMIT
      ? `\n${promptListItem('This list is truncated. If the artist names a release that is not shown, never claim it is not theirs; tool calls resolve titles against the full catalog.')}`
      : '';
  const named = namedReleaseBlock(namedReleases, releases, now);
  const namedSuffix = named ? `\n${named}` : '';

  return `${releaseLines}${overflowLine}${truncationNote}${namedSuffix}`;
}
