/**
 * Builds a prospect profile for a Linktree or Beacons lead without reading
 * its link page.
 *
 * Jovie never fetches Linktree, Beacons or other social HTML
 * (social-html-policy.ts, docs/network-support-matrix.md). These leads were
 * qualified from search results (search-evidence.ts), so the profile is
 * built from what the lead already holds — the cleaned search title — and
 * from Spotify's official API. The link page URL is kept as a profile link
 * but never requested.
 */

import type { Lead } from '@/lib/db/schema/leads';
import { normalizeArtistName } from '@/lib/dsp-enrichment/matching/name-similarity';
import { isCoreSocialHtmlHost } from '@/lib/ingestion/social-html-policy';
import { normalizeHandle } from '@/lib/ingestion/strategies/base/utils';
import { isLayloUrl } from '@/lib/ingestion/strategies/laylo';
import type { ExtractionResult } from '@/lib/ingestion/types';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { isBlacklistedSpotifyId } from '@/lib/spotify/blacklist';
import { spotifyClient } from '@/lib/spotify/client';
import { cleanSearchTitle } from './search-evidence';

/** Why a lead could not be built into a profile without its page. */
export type PagelessLeadSkipReason =
  | 'pageless_identity_unresolved'
  | 'pageless_handle_invalid';

export type PagelessLeadProfile =
  | {
      readonly ok: true;
      readonly handle: string;
      readonly displayName: string;
      readonly spotifyUrl: string | null;
      readonly extraction: ExtractionResult;
    }
  | {
      readonly ok: false;
      readonly reason: PagelessLeadSkipReason;
      readonly error: string;
    };

interface SpotifyMatch {
  readonly spotifyId: string;
  readonly name: string;
  readonly imageUrl: string | null;
}

type PagelessLeadInput = Pick<
  Lead,
  | 'linktreeUrl'
  | 'linktreeHandle'
  | 'sourceHandle'
  | 'sourcePlatform'
  | 'displayName'
  | 'spotifyUrl'
  | 'signalSnapshot'
>;

/**
 * True for leads whose link page Jovie must not read. Laylo pages are read
 * through Laylo's public profile JSON, so a Laylo URL is never pageless, even
 * when the row kept the schema's default `linktree` source platform.
 */
export function isPagelessLead(
  lead: Pick<Lead, 'linktreeUrl' | 'sourcePlatform'>
): boolean {
  if (isLayloUrl(lead.linktreeUrl)) return false;
  if (lead.sourcePlatform === 'linktree' || lead.sourcePlatform === 'beacons')
    return true;
  try {
    return isCoreSocialHtmlHost(new URL(lead.linktreeUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Username candidate from the lead's handle. Beacons leads are keyed
 * `beacons:<handle>`; the prefix is never part of the username.
 */
export function pagelessUsernameCandidate(
  lead: Pick<Lead, 'linktreeHandle' | 'sourceHandle'>
): string | null {
  const raw = (lead.sourceHandle ?? lead.linktreeHandle).replace(
    /^beacons:/i,
    ''
  );
  const handle = normalizeHandle(raw)
    .replaceAll(/[^a-z0-9_]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .slice(0, 30)
    .replace(/_+$/, '');
  return handle || null;
}

/** The lead's stored name, else the latest search title, cleaned. */
export function pagelessDisplayName(
  lead: Pick<Lead, 'displayName' | 'signalSnapshot'>
): string | null {
  const stored = cleanScrapedDisplayName(lead.displayName);
  if (stored) return stored;
  const evidence = lead.signalSnapshot?.searchEvidence ?? [];
  for (const entry of [...evidence].reverse()) {
    const title = cleanScrapedDisplayName(cleanSearchTitle(entry.title));
    if (title) return title;
  }
  return null;
}

const compactName = (name: string) =>
  normalizeArtistName(name).replaceAll(/[\s_]+/g, '');

/**
 * One Spotify artist for the lead, through the official API: the lead's own
 * Spotify link when it has one, else a search whose single exact-name
 * result is the match. Several artists with that name is no match.
 */
export async function matchPagelessSpotifyArtist(input: {
  readonly name: string | null;
  readonly handle: string;
  readonly spotifyUrl: string | null;
}): Promise<SpotifyMatch | null> {
  if (!spotifyClient.isAvailable()) return null;
  try {
    const linkedId = input.spotifyUrl
      ? extractSpotifyArtistId(input.spotifyUrl)
      : null;
    if (linkedId) {
      if (isBlacklistedSpotifyId(linkedId)) return null;
      const artist = await spotifyClient.getArtist(linkedId);
      return {
        spotifyId: artist.spotifyId,
        name: artist.name,
        imageUrl: artist.imageUrl,
      };
    }

    const query = input.name ?? input.handle;
    const wanted = compactName(query);
    if (!wanted) return null;
    const results = await spotifyClient.searchArtists(query, 5);
    const exact = new Map(
      results
        .filter(artist => compactName(artist.name) === wanted)
        .map(artist => [artist.spotifyId, artist])
    );
    if (exact.size !== 1) return null;
    const [artist] = exact.values();
    return {
      spotifyId: artist!.spotifyId,
      name: artist!.name,
      imageUrl: artist!.imageUrl,
    };
  } catch {
    // Spotify down or the artist gone: no match, never invented data.
    return null;
  }
}

/**
 * Resolves the profile a pageless lead becomes. Needs a reliable name from
 * search evidence or a Spotify match; with neither the lead is not built.
 */
export async function buildPagelessLeadProfile(
  lead: PagelessLeadInput
): Promise<PagelessLeadProfile> {
  const handle = pagelessUsernameCandidate(lead);
  if (!handle) {
    return {
      ok: false,
      reason: 'pageless_handle_invalid',
      error: 'Lead handle cannot become a username',
    };
  }

  const evidenceName = pagelessDisplayName(lead);
  const spotify = await matchPagelessSpotifyArtist({
    name: evidenceName,
    handle,
    spotifyUrl: lead.spotifyUrl,
  });
  const displayName = spotify?.name ?? evidenceName;
  if (!displayName) {
    return {
      ok: false,
      reason: 'pageless_identity_unresolved',
      error: 'No reliable name or Spotify match for lead',
    };
  }

  const spotifyUrl = spotify
    ? `https://open.spotify.com/artist/${spotify.spotifyId}`
    : null;
  const sourcePlatform =
    lead.sourcePlatform === 'beacons' ? 'beacons' : 'linktree';
  const links: ExtractionResult['links'] = [
    ...(spotifyUrl
      ? [{ url: spotifyUrl, platformId: 'spotify', sourcePlatform: 'spotify' }]
      : []),
    // Stored as the artist's link-in-bio link; never requested.
    { url: lead.linktreeUrl, platformId: sourcePlatform, sourcePlatform },
  ];

  return {
    ok: true,
    handle,
    displayName,
    spotifyUrl,
    extraction: {
      links,
      sourcePlatform: spotify ? 'spotify' : 'search_match',
      sourceUrl: spotifyUrl,
      displayName,
      avatarUrl: spotify?.imageUrl ?? null,
      hasPaidTier: null,
      bio: null,
    },
  };
}
