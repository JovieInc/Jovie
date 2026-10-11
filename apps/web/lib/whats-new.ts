/**
 * In-app What's New contract (Mac banner, iOS sheet, web shell).
 *
 * One source of truth: CHANGELOG.md, projected through the same parser and
 * customer projection as `/changelog`. One entry per public release, newest
 * first. `id` is the release version, so "last seen" is a single string a
 * client can persist per device.
 *
 * Pure module: no filesystem or server imports, so clients can reuse
 * `resolveUnseenWhatsNew`.
 */

import { type ChangelogRelease, changelogInlineText } from './changelog-parser';
import {
  type CustomerChangelogHero,
  isCustomerChangelogPostUrl,
  parseCustomerChangelogHero,
  projectCustomerChangelog,
  resolveCustomerChangelogHero,
} from './customer-changelog';

export const WHATS_NEW_CONTRACT_VERSION = 1;
export const WHATS_NEW_ENTRY_LIMIT = 5;
export const WHATS_NEW_PATH = '/changelog/whats-new.json';

const HIGHLIGHT_LIMIT = 3;

export interface WhatsNewEntry {
  /** Release version; stable last-seen key. */
  readonly id: string;
  readonly title: string;
  /** ISO date (YYYY-MM-DD) or empty when the release heading has none. */
  readonly date: string;
  readonly summary: string;
  /** Absolute URL of the release changelog post. */
  readonly url: string;
  /** Other customer outcomes in the release, excluding the title. */
  readonly highlights: readonly string[];
  /** Optional `### Dogfood` bullets; empty when the release has none. */
  readonly dogfood: readonly string[];
  /** Optional for v1 legacy payloads; null means text-only, never new art. */
  readonly hero?: CustomerChangelogHero | null;
}

export interface WhatsNewFeed {
  readonly version: typeof WHATS_NEW_CONTRACT_VERSION;
  /** Absolute URL of the changelog index. */
  readonly changelogUrl: string;
  readonly entries: readonly WhatsNewEntry[];
}

export function projectWhatsNew(
  releases: readonly ChangelogRelease[],
  baseUrl: string,
  limit: number = WHATS_NEW_ENTRY_LIMIT
): WhatsNewFeed {
  const entries: WhatsNewEntry[] = [];

  for (const release of releases) {
    if (entries.length >= limit) break;
    const outcomes = projectCustomerChangelog([release]);
    const lead = outcomes[0];
    if (!lead) continue;

    entries.push({
      id: release.version,
      hero: resolveCustomerChangelogHero(release.version),
      title: lead.title,
      date: release.date,
      // Daily sections choose the customer lead; a different story's digest
      // blockquote must not become that lead's explanation.
      summary:
        release.kind === 'daily'
          ? lead.summary
          : release.summary || lead.summary,
      url: `${baseUrl}/changelog/${encodeURIComponent(release.version)}`,
      highlights: outcomes
        .slice(1, HIGHLIGHT_LIMIT + 1)
        .map(outcome => outcome.title),
      dogfood: (release.dogfood ?? [])
        .map(entry => changelogInlineText(entry).trim())
        .filter(Boolean),
    });
  }

  return {
    version: WHATS_NEW_CONTRACT_VERSION,
    changelogUrl: `${baseUrl}/changelog`,
    entries,
  };
}

export interface UnseenWhatsNew {
  /** Newest unseen entry; the one a surface presents. */
  readonly entry: WhatsNewEntry;
  readonly unseenCount: number;
  /** The post for one unseen release, the changelog index for several. */
  readonly href: string;
}

/**
 * Decide what (if anything) a surface should present.
 *
 * - No entries: nothing.
 * - Newest entry already seen: nothing.
 * - Last-seen id found further down: everything above it is unseen.
 * - No last-seen id, or one that aged out of the feed: only the newest entry
 *   counts, so a first launch never reads as a backlog.
 */
export function resolveUnseenWhatsNew(
  feed: Pick<WhatsNewFeed, 'changelogUrl' | 'entries'>,
  lastSeenId: string | null | undefined
): UnseenWhatsNew | null {
  const newest = feed.entries[0];
  if (!newest || newest.id === lastSeenId) return null;

  const seenIndex = lastSeenId
    ? feed.entries.findIndex(entry => entry.id === lastSeenId)
    : -1;
  const unseenCount = seenIndex > 0 ? seenIndex : 1;

  return {
    entry: newest,
    unseenCount,
    href: unseenCount > 1 ? feed.changelogUrl : newest.url,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isWhatsNewEntry(value: unknown): value is WhatsNewEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.title === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.summary === 'string' &&
    typeof entry.url === 'string' &&
    isStringArray(entry.highlights) &&
    isStringArray(entry.dogfood)
  );
}

/** Validate an untrusted payload; anything malformed reads as "nothing new". */
export function parseWhatsNewFeed(value: unknown): WhatsNewFeed | null {
  if (!value || typeof value !== 'object') return null;
  const feed = value as Record<string, unknown>;
  if (
    feed.version !== WHATS_NEW_CONTRACT_VERSION ||
    typeof feed.changelogUrl !== 'string' ||
    !Array.isArray(feed.entries)
  ) {
    return null;
  }
  return {
    version: WHATS_NEW_CONTRACT_VERSION,
    changelogUrl: feed.changelogUrl,
    entries: feed.entries.filter(isWhatsNewEntry).map(entry => ({
      ...entry,
      hero: isCustomerChangelogPostUrl(entry.url, entry.id)
        ? parseCustomerChangelogHero(entry.hero, entry.id)
        : null,
    })),
  };
}
