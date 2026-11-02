/**
 * System-1 opener: a bare greeting ("yo", "hi") gets the single most valuable
 * thing Jovie already knows about this artist, from loaded state, with no
 * model call (chat at most 2s p95; 2026-11-01 transcript opened with "What are
 * we working on?").
 *
 * Pure: no DB, model or clock reads. Every fact comes from the artist context
 * and catalog the route already loaded; no counts or claims are invented.
 */

import { getProfileUrl } from '@/constants/domains';
import { findProfileLink } from '@/lib/chat/artist-links';
import type { ArtistContext } from '@/lib/chat/types';

export interface OpenerRelease {
  readonly title: string;
  readonly releaseDate: string | null;
}

export type InstinctOpenerIntent =
  | 'opener_upcoming_release'
  | 'opener_draft_bio'
  | 'opener_youtube_plan'
  | 'opener_connect_music';

export interface InstinctOpener {
  readonly intent: InstinctOpenerIntent;
  readonly text: string;
}

const GREETING =
  /^(?:yo+|hi+|hey+|hello|hiya|howdy|sup|wh?at'?s up|wassup|gm|good (?:morning|afternoon|evening)|ok(?:ay)? (?:let'?s go|go))(?:,? jovie)?[\s.!?]*$/i;

const UPCOMING_WINDOW_DAYS = 42;
const DAY_MS = 86_400_000;

export function isBareGreeting(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 40 && GREETING.test(trimmed);
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function datedReleases(
  releases: readonly OpenerRelease[]
): { title: string; date: Date }[] {
  return releases
    .map(r => ({
      title: r.title,
      date: r.releaseDate ? new Date(r.releaseDate) : new Date(Number.NaN),
    }))
    .filter(r => !Number.isNaN(r.date.getTime()));
}

function upcomingOpener(
  artist: ArtistContext,
  releases: readonly OpenerRelease[],
  now: Date
): InstinctOpener | null {
  const next = datedReleases(releases)
    .map(r => ({
      ...r,
      days: Math.round((utcDay(r.date) - utcDay(now)) / DAY_MS),
    }))
    .filter(r => r.days >= 0 && r.days <= UPCOMING_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)[0];
  if (!next) return null;
  const when =
    next.days === 0
      ? 'is out today'
      : `drops in ${next.days} day${next.days === 1 ? '' : 's'}`;
  return {
    intent: 'opener_upcoming_release',
    text: `${next.title} ${when}. The move today: make its release page the top link on ${getProfileUrl(artist.username)} so every bio click lands on it. Say "go" and I'll plan the rest of the launch around that date.`,
  };
}

const LIST_FORMAT = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

/** Bio drafted only from verified context: name, genres, catalog span. */
export function draftBioFromFacts(
  artist: ArtistContext,
  releases: readonly OpenerRelease[]
): string | null {
  const dated = datedReleases(releases).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  if (releases.length === 0) return null;
  const genres = artist.genres.slice(0, 2);
  const kind =
    genres.length > 0 ? `${LIST_FORMAT.format(genres)} artist` : 'artist';
  const article = /^[aeiou]/i.test(kind) ? 'an' : 'a';
  const first = dated[0]?.date.getUTCFullYear();
  const latest = dated.at(-1);
  const span =
    first && latest && latest.date.getUTCFullYear() > first
      ? ` since ${first}`
      : '';
  const count = `${releases.length} release${releases.length === 1 ? '' : 's'}`;
  const latestLine = latest ? ` The latest is ${latest.title}.` : '';
  return `${artist.displayName} is ${article} ${kind} with ${count}${span}.${latestLine}`;
}

function bioOpener(
  artist: ArtistContext,
  releases: readonly OpenerRelease[]
): InstinctOpener | null {
  if (artist.bio?.trim()) return null;
  const draft = draftBioFromFacts(artist, releases);
  if (!draft) return null;
  return {
    intent: 'opener_draft_bio',
    text: `Your bio on ${getProfileUrl(artist.username)} is empty, and it's the first thing a new listener reads. Draft from your catalog:\n\n"${draft}"\n\nSay "use it" and it goes live, or tell me what to change.`,
  };
}

function youtubeOpener(
  artist: ArtistContext,
  releases: readonly OpenerRelease[]
): InstinctOpener | null {
  const links = artist.linksContext;
  if (!links || links.connectedAccounts.includes('youtube')) return null;
  const channel = findProfileLink(links.links, 'youtube');
  if (!channel || releases.length < 3) return null;
  const handle = /\/@([^/?#]+)/.exec(channel.url)?.[1];
  const name = handle ? `@${handle}` : 'your YouTube channel';
  return {
    intent: 'opener_youtube_plan',
    text: `${name} is on your profile and you have ${releases.length} releases. Say "go" and I'll read the channel and rank the moves that send those viewers to each song's page.`,
  };
}

function musicOpener(artist: ArtistContext): InstinctOpener | null {
  if (artist.hasMusicLinks) return null;
  return {
    intent: 'opener_connect_music',
    text: `${getProfileUrl(artist.username)} has no streaming links yet, so visitors have nowhere to listen. Tell me your artist name on Spotify and I'll pull in your music.`,
  };
}

/**
 * Most valuable first: a release inside six weeks, then an empty bio with a
 * catalog, then an unread YouTube channel, then missing music. Null hands the
 * turn to the model.
 */
export function buildInstinctOpener(input: {
  readonly text: string;
  readonly artist: ArtistContext;
  readonly releases: readonly OpenerRelease[];
  readonly now: Date;
}): InstinctOpener | null {
  if (!isBareGreeting(input.text)) return null;
  return (
    upcomingOpener(input.artist, input.releases, input.now) ??
    bioOpener(input.artist, input.releases) ??
    youtubeOpener(input.artist, input.releases) ??
    musicOpener(input.artist)
  );
}
