// Identity enrichment for provider-ID-backed unclaimed artists (JOV-6529), run
// inside structured-credit reconciliation before a profile is share-ready.
// MusicBrainz artists are matched by shared ISRCs — never display-name
// similarity. Apply is insert-only and idempotent.

import { sql as drizzleSql, eq } from 'drizzle-orm';

import type { DbOrTransaction } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  MUSICBRAINZ_URL_TYPE_MAP,
  type MusicBrainzArtist,
} from '@/lib/dsp-enrichment/types';
import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatformByHost,
  getPlatform,
  isUnsafeUrl,
  normalizeUrl,
} from '@/lib/utils/platform-detection';

export type IdentityLinkSource = 'spotify' | 'musicbrainz';

export interface ArtistIdentityLink {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly canonicalIdentity: string;
  readonly confidence: number;
  readonly source: IdentityLinkSource;
  readonly sourceEntityId: string; // spotify id / MBID
}

type ExtractedLink = Omit<ArtistIdentityLink, 'source' | 'sourceEntityId'>;

export interface ArtistIdentityEnrichment {
  readonly observedAt: string;
  readonly musicBrainzArtistId: string | null;
  readonly links: readonly ArtistIdentityLink[];
  readonly shareReadiness: 'ready' | 'limited';
}

export type MusicBrainzMatchOutcome =
  | { kind: 'matched'; mbid: string; isrcCount: number }
  | { kind: 'conflicted'; candidates: readonly string[] }
  | { kind: 'not_found' }
  | { kind: 'not_checked'; reason: string };

const SOCIAL_NETWORK_HOST_PLATFORMS = new Set(
  'instagram twitter x tiktok facebook youtube twitch discord bandcamp soundcloud'.split(
    ' '
  )
);

export function identityKeyForLink(platformId: string, url: string): string {
  const normalizedUrl = normalizeUrl(url);
  const platform = getPlatform(platformId);
  if (platform) return canonicalIdentity({ platform, normalizedUrl });
  const parsed = URL.parse(normalizedUrl);
  if (!parsed) return `${platformId}:${normalizedUrl.toLowerCase()}`;
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  return `${platformId}:${host}${parsed.pathname.toLowerCase()}`;
}

export function classifyMusicBrainzRelation(
  relationType: string,
  resource: string
): { platform: string; platformType: string; url: string } | null {
  const trimmed = resource.trim();
  if (!trimmed || isUnsafeUrl(trimmed)) return null;

  const url = normalizeUrl(trimmed);
  const detected = detectPlatformByHost(url);
  const mapped = MUSICBRAINZ_URL_TYPE_MAP[relationType];
  if (!mapped) return null;

  if (relationType === 'social network' || mapped === 'website') {
    return detected && SOCIAL_NETWORK_HOST_PLATFORMS.has(detected.id)
      ? { platform: detected.id, platformType: detected.category, url }
      : { platform: 'website', platformType: 'websites', url };
  }
  return {
    platform: mapped,
    platformType: detected?.category ?? 'social',
    url,
  };
}

export function extractMusicBrainzIdentityLinks(artist: MusicBrainzArtist): {
  readonly links: readonly ExtractedLink[];
  readonly conflictedPlatforms: ReadonlySet<string>;
} {
  const byIdentity = new Map<string, ExtractedLink>();
  const platformIdentities = new Map<string, Set<string>>();

  for (const relation of artist.relations ?? []) {
    const resource = relation.url?.resource;
    if (relation.ended === true || !resource) continue;
    const classified = classifyMusicBrainzRelation(relation.type, resource);
    if (!classified) continue;

    const identity = identityKeyForLink(classified.platform, classified.url);
    platformIdentities.set(
      classified.platform,
      (platformIdentities.get(classified.platform) ?? new Set<string>()).add(
        identity
      )
    );
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, {
        ...classified,
        canonicalIdentity: identity,
        confidence: relation.type === 'social network' ? 0.85 : 0.9,
      });
    }
  }

  const conflictedPlatforms = new Set<string>();
  const links: ExtractedLink[] = [];
  for (const link of byIdentity.values()) {
    if ((platformIdentities.get(link.platform)?.size ?? 0) > 1) {
      conflictedPlatforms.add(link.platform);
    } else {
      links.push(link);
    }
  }
  return { links, conflictedPlatforms };
}

function pickMusicBrainzArtistByIsrcSupport(
  recordings: readonly { isrc: string; artistIds: readonly string[] }[]
): MusicBrainzMatchOutcome {
  const support = new Map<string, Set<string>>();
  for (const { isrc, artistIds } of recordings) {
    for (const id of artistIds) {
      support.set(id, (support.get(id) ?? new Set<string>()).add(isrc));
    }
  }
  const ranked = [...support.entries()]
    .map(([mbid, isrcs]) => ({ mbid, count: isrcs.size }))
    .filter(e => e.count >= 2)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) return { kind: 'not_found' };
  const tied = ranked.filter(e => e.count === ranked[0].count);
  if (tied.length > 1) {
    return { kind: 'conflicted', candidates: tied.map(e => e.mbid).sort() };
  }
  return { kind: 'matched', mbid: ranked[0].mbid, isrcCount: ranked[0].count };
}

async function musicBrainzProvider() {
  try {
    const provider = await import('@/lib/dsp-enrichment/providers/musicbrainz');
    return provider.isMusicBrainzAvailable() ? provider : null;
  } catch {
    return null;
  }
}

export async function matchMusicBrainzArtistForIsrcs(
  isrcs: readonly string[]
): Promise<MusicBrainzMatchOutcome> {
  const bounded = isrcs.slice(0, 8);
  if (bounded.length < 2) {
    return { kind: 'not_checked', reason: 'insufficient_isrcs' };
  }
  const provider = await musicBrainzProvider();
  if (!provider) {
    return { kind: 'not_checked', reason: 'musicbrainz_unavailable' };
  }

  const recordings: { isrc: string; artistIds: string[] }[] = [];
  try {
    for (const isrc of bounded) {
      const results = await provider.lookupMusicBrainzByIsrc(isrc);
      recordings.push({
        isrc,
        artistIds: (results[0]?.['artist-credit'] ?? [])
          .map(credit => credit.artist?.id)
          .filter((id): id is string => Boolean(id)),
      });
    }
  } catch (error) {
    logger.warn('MusicBrainz identity match failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: 'not_checked', reason: 'musicbrainz_error' };
  }
  return pickMusicBrainzArtistByIsrcSupport(recordings);
}

export async function enrichArtistIdentity(input: {
  readonly spotifyId: string;
  readonly spotifyUrl: string;
  readonly isrcs: readonly string[];
}): Promise<ArtistIdentityEnrichment> {
  const observedAt = new Date().toISOString();
  const deduped = new Map<string, ArtistIdentityLink>();
  const addLink = (link: ArtistIdentityLink) => {
    if (!deduped.has(link.canonicalIdentity))
      deduped.set(link.canonicalIdentity, link);
  };

  addLink({
    platform: 'spotify',
    platformType: 'dsp',
    url: input.spotifyUrl,
    canonicalIdentity: identityKeyForLink('spotify', input.spotifyUrl),
    confidence: 1,
    source: 'spotify',
    sourceEntityId: input.spotifyId,
  });

  const match = await matchMusicBrainzArtistForIsrcs(input.isrcs);
  let musicBrainzArtistId: string | null = null;
  let mbConflicted: ReadonlySet<string> = new Set<string>();

  if (match.kind === 'matched') {
    try {
      const provider = await musicBrainzProvider();
      const artist =
        provider && (await provider.getMusicBrainzArtist(match.mbid));
      if (artist) {
        musicBrainzArtistId = artist.id;
        const extracted = extractMusicBrainzIdentityLinks(artist);
        for (const link of extracted.links) {
          addLink({
            ...link,
            source: 'musicbrainz',
            sourceEntityId: artist.id,
          });
        }
        mbConflicted = extracted.conflictedPlatforms;
      }
    } catch (error) {
      logger.warn('MusicBrainz artist url-rel fetch failed', {
        mbid: match.mbid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const shareReadiness =
    mbConflicted.size > 0 || match.kind === 'conflicted' || deduped.size < 2
      ? 'limited'
      : 'ready';

  return {
    observedAt,
    musicBrainzArtistId,
    links: [...deduped.values()],
    shareReadiness,
  };
}

export async function applyArtistIdentityEnrichment(
  tx: DbOrTransaction,
  profileId: string,
  enrichment: ArtistIdentityEnrichment
): Promise<{ readonly inserted: number }> {
  const existing = await tx
    .select({ url: socialLinks.url, platform: socialLinks.platform })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profileId));

  const existingIdentities = new Set(
    existing.map(row => identityKeyForLink(row.platform, row.url))
  );

  let inserted = 0;
  let sortOrder = existing.length;
  for (const link of enrichment.links) {
    if (existingIdentities.has(link.canonicalIdentity)) continue;
    await tx
      .insert(socialLinks)
      .values({
        creatorProfileId: profileId,
        platform: link.platform,
        platformType: link.platformType,
        url: link.url,
        sortOrder,
        confidence: link.confidence.toFixed(2),
        sourcePlatform: link.source,
        sourceType: 'ingested',
        evidence: {
          sources: ['artist_identity_enrichment', link.source],
          signals: [link.sourceEntityId, link.canonicalIdentity],
        },
      })
      .onConflictDoNothing();
    existingIdentities.add(link.canonicalIdentity);
    inserted += 1;
    sortOrder += 1;
  }

  await tx
    .update(creatorProfiles)
    .set({
      settings: drizzleSql`jsonb_set(
        COALESCE(${creatorProfiles.settings}, '{}'::jsonb),
        '{identityEnrichment}',
        ${JSON.stringify(enrichment)}::jsonb
      )`,
      updatedAt: drizzleSql`now()`,
    })
    .where(eq(creatorProfiles.id, profileId));

  return { inserted };
}
