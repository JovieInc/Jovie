/**
 * Identity enrichment for unclaimed structured-credit artist profiles
 * (JOV-6529), run before a profile is treated as share-ready. Two
 * provider-ID-keyed sources are consulted:
 *
 *   1. MusicFetch artist lookup anchored to the exact Spotify artist URL.
 *   2. MusicBrainz `url-rels` via the registry `musicbrainz_id`, or the MBID
 *      MusicFetch resolved from that Spotify URL. Only artist-curated
 *      relation types are accepted; fan/label/database and ended (stale)
 *      relations are rejected.
 *
 * Display-name similarity is never used. Links are deduped by canonical
 * identity; same-platform disagreement across exact-entity sources is a
 * recorded conflict and fails closed. The receipt persisted on the
 * `unclaimedArtistProfile` marker is what Ovie reads for `not_checked` /
 * `not_found` / `conflicted` / `verified` states and share readiness.
 */

import 'server-only';

import type { DbOrTransaction } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import type { MusicFetchArtistResult } from '@/lib/dsp-enrichment/providers/musicfetch';
import type { MusicBrainzArtist } from '@/lib/dsp-enrichment/types';
import { SERVICE_TO_PROVIDER } from '@/lib/dsp-registry';
import type {
  IdentityEnrichmentConflict,
  IdentityEnrichmentSource,
  IdentitySourceStatus,
  UnclaimedEnrichmentStatus,
  UnclaimedIdentityEnrichmentReceipt,
} from '@/lib/profile/unclaimed-artist-profile';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatformByHost,
  normalizeUrl,
} from '@/lib/utils/platform-detection';

interface IdentityEvidence {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly identity: string;
  readonly source: IdentityEnrichmentSource;
  readonly confidence: number;
  readonly providerId?: string;
  readonly relType?: string;
}

export interface EnrichedDestination {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly identity: string;
  /** Exact-entity sources that reported this destination. */
  readonly sources: readonly IdentityEnrichmentSource[];
  readonly confidence: number;
  /** Two or more independent sources agreed on the same identity. */
  readonly verified: boolean;
}

export interface UnclaimedIdentityDiscovery {
  readonly destinations: readonly EnrichedDestination[];
  readonly conflicts: readonly IdentityEnrichmentConflict[];
  readonly sources: Record<IdentityEnrichmentSource, IdentitySourceStatus>;
  readonly observedAt: string;
}

export interface UnclaimedArtistIdentityInput {
  readonly spotifyId: string | null;
  readonly musicbrainzId?: string | null;
}

export interface IdentityEnrichmentFetchers {
  readonly fetchMusicfetchArtist: (
    spotifyUrl: string
  ) => Promise<MusicFetchArtistResult | null>;
  readonly fetchMusicbrainzArtist: (
    mbid: string
  ) => Promise<MusicBrainzArtist | null>;
}

// Lazy provider imports keep this module free of env coupling in tests.
const DEFAULT_FETCHERS: IdentityEnrichmentFetchers = {
  fetchMusicfetchArtist: async spotifyUrl =>
    (
      await import('@/lib/dsp-enrichment/providers/musicfetch')
    ).fetchArtistBySpotifyUrl(spotifyUrl),
  fetchMusicbrainzArtist: async mbid =>
    (
      await import('@/lib/dsp-enrichment/providers/musicbrainz')
    ).getMusicBrainzArtist(mbid),
};

/** MusicBrainz url-rel types denoting artist-controlled destinations. */
const ARTIST_CONTROLLED_REL_TYPES = new Map<string, number>([
  ['official homepage', 0.95],
  ['social network', 0.95],
  ['bandcamp', 0.9],
  ['soundcloud', 0.9],
  ['youtube', 0.9],
  ['vimeo', 0.85],
  ['video channel', 0.85],
  ['streaming music', 0.85],
  ['blog', 0.8],
  ['patronage', 0.8],
  ['crowdfunding', 0.8],
]);

const MUSICFETCH_CONFIDENCE = 0.9;
const MULTI_SOURCE_BONUS = 0.05;

function toEvidence(input: {
  readonly url: string;
  readonly source: IdentityEnrichmentSource;
  readonly confidence: number;
  readonly platformHint?: string;
  readonly providerId?: string;
  readonly relType?: string;
}): IdentityEvidence | null {
  let normalized: string;
  try {
    normalized = normalizeUrl(input.url);
  } catch {
    return null;
  }
  if (!normalized.startsWith('https://')) return null;

  const detected = detectPlatformByHost(normalized);
  let platform = detected?.id ?? input.platformHint;
  if (platform === 'twitter') platform = 'x';
  if (!platform) return null;

  let identity = detected
    ? canonicalIdentity({ platform: detected, normalizedUrl: normalized })
    : `${platform}:${normalized.toLowerCase()}`;
  // `twitter` and `x` are the same destination identity.
  if (platform === 'x' && identity.startsWith('twitter:')) {
    identity = `x:${identity.slice('twitter:'.length)}`;
  }

  return {
    platform,
    platformType: detected?.category ?? 'custom',
    url: normalized,
    identity,
    source: input.source,
    confidence: input.confidence,
    providerId: input.providerId,
    relType: input.relType,
  };
}

function collectMusicfetchEvidence(
  result: MusicFetchArtistResult,
  evidence: IdentityEvidence[]
): string | null {
  let resolvedMbid: string | null = null;

  for (const [serviceName, service] of Object.entries(result.services ?? {})) {
    // The MusicBrainz entry carries the resolved MBID — an exact entity key
    // for the second lookup — even when it has no link URL.
    if (serviceName === 'musicBrainz') {
      if (typeof service.id === 'string' && service.id.trim()) {
        resolvedMbid = service.id;
      }
      continue;
    }

    const url = service?.link ?? service?.url;
    if (!url) continue;

    const item = toEvidence({
      url,
      source: 'musicfetch',
      confidence: MUSICFETCH_CONFIDENCE,
      platformHint: SERVICE_TO_PROVIDER[serviceName],
      providerId: typeof service.id === 'string' ? service.id : undefined,
    });
    if (item) evidence.push(item);
  }

  return resolvedMbid;
}

function collectMusicBrainzEvidence(
  artist: MusicBrainzArtist,
  evidence: IdentityEvidence[]
): void {
  for (const rel of artist.relations ?? []) {
    const resource = rel.url?.resource;
    // Ended relations are stale handles; never publish them.
    if (!resource || rel.ended || rel.end) continue;

    const confidence = ARTIST_CONTROLLED_REL_TYPES.get(rel.type);
    if (confidence === undefined) continue;

    const item = toEvidence({
      url: resource,
      source: 'musicbrainz',
      confidence,
      // An official homepage is a website even on an unknown host.
      platformHint: rel.type === 'official homepage' ? 'website' : undefined,
      relType: rel.type,
    });
    if (item) evidence.push(item);
  }
}

/**
 * Merge evidence by canonical identity, then fail closed on disagreement:
 * two exact-entity sources pointing one platform at different destinations
 * is a conflict and nothing is inserted for it. Multiple `website` domains
 * are legitimate (label + artist domains) and never conflict.
 */
function resolveEvidence(evidence: readonly IdentityEvidence[]): {
  readonly destinations: EnrichedDestination[];
  readonly conflicts: IdentityEnrichmentConflict[];
} {
  const byIdentity = new Map<string, IdentityEvidence[]>();
  for (const item of evidence) {
    const group = byIdentity.get(item.identity) ?? [];
    group.push(item);
    byIdentity.set(item.identity, group);
  }

  const merged = [...byIdentity.values()].map(group => {
    const sources = [...new Set(group.map(item => item.source))].sort();
    const best = group.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return {
      platform: best.platform,
      platformType: best.platformType,
      url: best.url,
      identity: best.identity,
      sources,
      confidence: Math.min(
        0.99,
        Math.max(...group.map(item => item.confidence)) +
          (sources.length > 1 ? MULTI_SOURCE_BONUS : 0)
      ),
      verified: sources.length > 1,
    } satisfies EnrichedDestination;
  });

  const byPlatform = new Map<string, EnrichedDestination[]>();
  for (const destination of merged) {
    const group = byPlatform.get(destination.platform) ?? [];
    group.push(destination);
    byPlatform.set(destination.platform, group);
  }

  const destinations: EnrichedDestination[] = [];
  const conflicts: IdentityEnrichmentConflict[] = [];
  for (const [platform, group] of byPlatform) {
    if (platform !== 'website' && group.length > 1) {
      conflicts.push({
        platform,
        urls: group.map(d => d.url).sort(),
        sources: [
          ...new Set(group.flatMap(d => d.sources)),
        ].sort() as IdentityEnrichmentSource[],
      });
      continue;
    }
    destinations.push(...group);
  }

  return { destinations, conflicts };
}

/**
 * Discover artist-controlled destinations for one exact provider-ID-backed
 * unclaimed artist. Failures degrade to `not_found`, never to guesses.
 */
export async function discoverUnclaimedArtistIdentity(
  input: UnclaimedArtistIdentityInput,
  fetchers: IdentityEnrichmentFetchers = DEFAULT_FETCHERS
): Promise<UnclaimedIdentityDiscovery> {
  const evidence: IdentityEvidence[] = [];
  const sources: Record<IdentityEnrichmentSource, IdentitySourceStatus> = {
    musicfetch: 'not_checked',
    musicbrainz: 'not_checked',
  };

  let mbid = input.musicbrainzId ?? null;

  if (input.spotifyId) {
    sources.musicfetch = 'not_found';
    try {
      const result = await fetchers.fetchMusicfetchArtist(
        buildSpotifyArtistUrl(input.spotifyId)
      );
      if (result) {
        const before = evidence.length;
        const resolvedMbid = collectMusicfetchEvidence(result, evidence);
        mbid = mbid ?? resolvedMbid;
        if (evidence.length > before) sources.musicfetch = 'verified';
      }
    } catch (error) {
      logger.info('Unclaimed artist enrichment: MusicFetch lookup failed', {
        spotifyId: input.spotifyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (mbid) {
    sources.musicbrainz = 'not_found';
    try {
      const artist = await fetchers.fetchMusicbrainzArtist(mbid);
      if (artist) {
        const before = evidence.length;
        collectMusicBrainzEvidence(artist, evidence);
        if (evidence.length > before) sources.musicbrainz = 'verified';
      }
    } catch (error) {
      logger.info('Unclaimed artist enrichment: MusicBrainz lookup failed', {
        musicbrainzId: mbid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { destinations, conflicts } = resolveEvidence(evidence);
  return {
    destinations,
    conflicts,
    sources,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Share-readiness minimum evidence contract: at least one destination agreed
 * on by two independent sources, or at least two artist-controlled
 * destinations with no unresolved conflict. Below the bar a profile stays
 * reachable via the stable `/artists/:artistId` route but is not promoted
 * as a finished profile.
 */
export function buildUnclaimedEnrichmentReceipt(
  discovery: UnclaimedIdentityDiscovery
): UnclaimedIdentityEnrichmentReceipt {
  const verifiedCount = discovery.destinations.filter(d => d.verified).length;
  const linkCount = discovery.destinations.length;
  const conflictCount = discovery.conflicts.length;
  const allUnchecked = Object.values(discovery.sources).every(
    status => status === 'not_checked'
  );

  const status: UnclaimedEnrichmentStatus = allUnchecked
    ? 'skipped'
    : linkCount === 0 && conflictCount === 0
      ? 'not_found'
      : linkCount === 0
        ? 'conflicted'
        : conflictCount > 0
          ? 'partial'
          : 'enriched';

  return {
    status,
    observedAt: discovery.observedAt,
    shareReady: verifiedCount > 0 || (linkCount >= 2 && conflictCount === 0),
    linkCount,
    verifiedCount,
    sources: discovery.sources,
    conflicts: discovery.conflicts,
  };
}

/** Platforms whose identity embeds a human handle for the handle composer. */
const HANDLE_IDENTITY_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'x',
  'facebook',
  'soundcloud',
  'twitch',
  'threads',
]);

/** JOV-6528 evidence input: handles from artist-controlled destinations. */
export function extractEvidenceHandles(
  discovery: UnclaimedIdentityDiscovery
): string[] {
  const handles: string[] = [];
  for (const destination of discovery.destinations) {
    if (!HANDLE_IDENTITY_PLATFORMS.has(destination.platform)) continue;
    const [platform, handle, extra] = destination.identity.split(':');
    if (!extra && handle && platform === destination.platform) {
      handles.push(handle);
    }
  }
  return [...new Set(handles)];
}

/**
 * Insert discovered destinations as `social_links` rows. Idempotent via the
 * (creator, platform, normalized url) unique index; only destination rows
 * are written — claimed or user-owned profile fields are never touched here.
 */
export async function persistUnclaimedDestinations(
  tx: DbOrTransaction,
  creatorProfileId: string,
  discovery: UnclaimedIdentityDiscovery
): Promise<number> {
  let inserted = 0;
  for (const [index, destination] of discovery.destinations.entries()) {
    if (destination.platform === 'spotify') continue;

    await tx
      .insert(socialLinks)
      .values({
        creatorProfileId,
        platform: destination.platform,
        platformType: destination.platformType,
        url: destination.url,
        displayText: '',
        sortOrder: index + 1,
        isActive: true,
        state: 'active',
        confidence: destination.confidence.toFixed(2),
        sourcePlatform: destination.sources[0],
        sourceType: 'ingested',
        evidence: {
          sources: destination.sources.map(
            source => `unclaimed_identity_${source}`
          ),
          signals: [destination.identity],
        },
        verificationStatus: destination.verified ? 'verified' : 'unverified',
      })
      .onConflictDoNothing();
    inserted += 1;
  }
  return inserted;
}
