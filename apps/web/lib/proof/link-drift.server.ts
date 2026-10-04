import 'server-only';

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isCoreSocialHtmlHost } from '@/lib/ingestion/social-html-policy';
import type {
  PresenceBuildArtifact,
  PresenceBuildFact,
} from '@/lib/onboarding/presence-build/types';
import {
  getSpotifyAlbums,
  getSpotifyArtistAlbums,
  getSpotifyTracks,
  type SpotifyAlbum,
} from '@/lib/spotify';
import {
  type BioLink,
  type CatalogRelease,
  detectLinkDrift,
  type LinkDriftInput,
  type LinkedRelease,
  type LinkHealth,
  type LinkPlatform,
  parseSpotifyRef,
} from './link-drift';
import { checkLinksHealth } from './link-health.server';

/**
 * Server side of the link-drift computed proof (JOV-7750). Reads only data
 * Jovie already holds or may fetch politely:
 * - the visitor's link-in-bio links as ingestion stored them (link-in-bio
 *   HTML is never fetched from Jovie servers; see social-html-policy.ts),
 * - their catalog from the official Spotify API,
 * - confirmed DSP profile matches,
 * - HEAD checks of the bio link targets, skipping core social hosts.
 */

export interface LinkDriftDeps {
  readonly getTracks?: typeof getSpotifyTracks;
  readonly getAlbums?: typeof getSpotifyAlbums;
  readonly getArtistAlbums?: typeof getSpotifyArtistAlbums;
  readonly checkHealth?: (
    urls: readonly string[]
  ) => Promise<readonly LinkHealth[]>;
  readonly now?: () => Date;
}

export interface LinkDriftSource {
  readonly bioPageUrl: string;
  readonly bioFetchedAt: string;
  readonly bioLinks: readonly BioLink[];
  readonly spotifyArtistId?: string | null;
  readonly dspProfiles?: LinkDriftInput['dspProfiles'];
}

type TrackWithAlbum = { album?: SpotifyAlbum; artists: { id: string }[] };

function toRelease(album: SpotifyAlbum): CatalogRelease {
  return { id: album.id, title: album.name, releaseDate: album.release_date };
}

function mostCommon(ids: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )[0]?.[0] ?? null
  );
}

/** Resolve catalog, linked releases and link health for one bio page. */
export async function buildLinkDriftInput(
  source: LinkDriftSource,
  deps: LinkDriftDeps = {}
): Promise<LinkDriftInput> {
  const getTracks = deps.getTracks ?? getSpotifyTracks;
  const getAlbums = deps.getAlbums ?? getSpotifyAlbums;
  const getArtistAlbums = deps.getArtistAlbums ?? getSpotifyArtistAlbums;
  const checkHealth = deps.checkHealth ?? checkLinksHealth;
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const refs = source.bioLinks.flatMap(link => {
    const ref = parseSpotifyRef(link.url);
    return ref ? [{ url: link.url, ref }] : [];
  });
  const trackRefs = refs.filter(item => item.ref?.kind === 'track');
  const albumRefs = refs.filter(item => item.ref?.kind === 'album');

  const [tracks, albums] = await Promise.all([
    getTracks(trackRefs.map(item => item.ref?.id as string)),
    getAlbums(albumRefs.map(item => item.ref?.id as string)),
  ]);
  const trackById = new Map(
    (tracks as unknown as (TrackWithAlbum & { id: string })[]).map(track => [
      track.id,
      track,
    ])
  );
  const albumById = new Map(albums.map(album => [album.id, album]));

  const artistRef = refs.find(item => item.ref?.kind === 'artist')?.ref?.id;
  const artistId =
    source.spotifyArtistId ??
    artistRef ??
    mostCommon([
      ...[...trackById.values()].flatMap(track =>
        track.artists[0] ? [track.artists[0].id] : []
      ),
      ...albums.flatMap(album =>
        album.artists[0] ? [album.artists[0].id] : []
      ),
    ]);

  const linkedReleases: LinkedRelease[] = [];
  for (const item of trackRefs) {
    const track = trackById.get(item.ref?.id as string);
    if (track?.album && track.artists.some(artist => artist.id === artistId)) {
      linkedReleases.push({ url: item.url, release: toRelease(track.album) });
    }
  }
  for (const item of albumRefs) {
    const album = albumById.get(item.ref?.id as string);
    if (album?.artists.some(artist => artist.id === artistId)) {
      linkedReleases.push({ url: item.url, release: toRelease(album) });
    }
  }

  const catalog = artistId
    ? (
        await getArtistAlbums(artistId, { includeGroups: ['album', 'single'] })
      ).albums.map(toRelease)
    : [];

  const healthUrls = source.bioLinks
    .map(link => link.url)
    .filter(url => {
      try {
        return !isCoreSocialHtmlHost(new URL(url).hostname);
      } catch {
        return false;
      }
    });
  const health = await checkHealth(healthUrls);

  return {
    bioPageUrl: source.bioPageUrl,
    bioFetchedAt: source.bioFetchedAt,
    bioLinks: source.bioLinks,
    catalog,
    catalogSource: artistId
      ? `https://open.spotify.com/artist/${artistId}`
      : 'no Spotify artist',
    catalogFetchedAt: artistId ? now : null,
    linkedReleases,
    dspProfiles: source.dspProfiles ?? [],
    health,
    healthCheckedAt: health.length > 0 ? now : null,
    now,
  };
}

const DSP_PLATFORMS: Readonly<Record<string, LinkPlatform>> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  deezer: 'deezer',
  youtube_music: 'youtube',
  soundcloud: 'soundcloud',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
};

/** The stored bio page and DSP profiles for a profile, or null. */
export async function loadLinkDriftSource(
  profileId: string
): Promise<LinkDriftSource | null> {
  const [lead] = await db
    .select({
      linktreeUrl: leads.linktreeUrl,
      allLinks: leads.allLinks,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(eq(leads.creatorProfileId, profileId))
    .orderBy(desc(leads.updatedAt))
    .limit(1);
  const bioLinks = Array.isArray(lead?.allLinks)
    ? (lead.allLinks as { url?: unknown; title?: unknown }[]).flatMap(link =>
        typeof link?.url === 'string'
          ? [
              {
                url: link.url,
                title: typeof link.title === 'string' ? link.title : null,
              },
            ]
          : []
      )
    : [];
  if (!lead || bioLinks.length === 0) return null;

  const [[profile], matches] = await Promise.all([
    db
      .select({
        spotifyId: creatorProfiles.spotifyId,
        spotifyUrl: creatorProfiles.spotifyUrl,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1),
    db
      .select({
        providerId: dspArtistMatches.providerId,
        url: dspArtistMatches.externalArtistUrl,
      })
      .from(dspArtistMatches)
      .where(
        and(
          eq(dspArtistMatches.creatorProfileId, profileId),
          inArray(dspArtistMatches.status, ['confirmed', 'auto_confirmed']),
          isNotNull(dspArtistMatches.externalArtistUrl)
        )
      )
      .limit(20),
  ]);

  const dspProfiles = [
    ...(profile?.spotifyUrl
      ? [{ platform: 'spotify' as const, url: profile.spotifyUrl }]
      : []),
    ...matches.flatMap(match => {
      const platform = DSP_PLATFORMS[match.providerId];
      return platform && match.url ? [{ platform, url: match.url }] : [];
    }),
  ];

  return {
    bioPageUrl: lead.linktreeUrl,
    bioFetchedAt: lead.updatedAt.toISOString(),
    bioLinks,
    spotifyArtistId: profile?.spotifyId ?? null,
    dspProfiles,
  };
}

/** Bio snapshots older than this are labelled with their date. */
const DATED_AFTER_DAYS = 7;

function dated(value: string, observedAt: string, now: string): string {
  const age = (Date.parse(now) - Date.parse(observedAt)) / 86_400_000;
  if (!(age > DATED_AFTER_DAYS)) return value;
  const day = new Date(observedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${value} (bio page as of ${day})`;
}

/** The presence-build step: drift findings as a hide-if-empty artifact. */
export async function runLinkDriftStep(
  profileId: string,
  deps: LinkDriftDeps = {}
): Promise<PresenceBuildArtifact> {
  const source = await loadLinkDriftSource(profileId);
  if (!source) {
    return {
      title: 'Link check',
      summary: 'No link-in-bio page on file to compare yet.',
      facts: [],
      empty: true,
    };
  }
  const input = await buildLinkDriftInput(source, deps);
  const findings = detectLinkDrift(input);
  if (findings.length === 0) {
    return {
      title: 'Link check',
      summary: 'Your bio links match your latest release and resolve.',
      facts: [],
      empty: true,
    };
  }
  const facts: PresenceBuildFact[] = findings.map(finding => ({
    label: finding.label,
    value:
      finding.kind === 'broken-links'
        ? finding.value
        : dated(finding.value, input.bioFetchedAt, input.now),
    source: finding.source,
    observedAt: finding.observedAt,
  }));
  return {
    title: 'Link check',
    summary: `Found ${findings.length} thing${findings.length === 1 ? '' : 's'} on your link-in-bio page to fix.`,
    facts,
  };
}
