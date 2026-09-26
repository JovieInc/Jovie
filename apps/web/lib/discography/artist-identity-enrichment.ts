/**
 * Identity enrichment for provider-ID-backed unclaimed artists (JOV-6529),
 * run inside structured-credit reconciliation before a profile is treated
 * as share-ready. MusicBrainz artist entities are matched by shared ISRCs —
 * never display-name similarity; url-rels plus the exact Spotify URL are
 * normalized and deduped by canonical identity; two sources agreeing raise
 * confidence while distinct identities for one platform are `conflicted`.
 * Per-platform evidence (`verified | not_found | not_checked | conflicted`)
 * persists on the profile so Ovie can render it. Apply is insert-only and
 * idempotent: claimed or user-locked rows are never updated or removed.
 */

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

export type ArtistIdentityLinkStatus =
  | 'verified'
  | 'not_found'
  | 'not_checked'
  | 'conflicted';

export type IdentityLinkSource = 'spotify' | 'musicbrainz';

export interface ArtistIdentityLink {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly canonicalIdentity: string;
  readonly confidence: number;
  readonly source: IdentityLinkSource;
  /** Exact provider entity that produced the link (spotify id / MBID). */
  readonly sourceEntityId: string;
}

export interface IdentityPlatformStatus {
  readonly status: ArtistIdentityLinkStatus;
  readonly observedAt: string;
  readonly sources: readonly IdentityLinkSource[];
  readonly conflicts?: readonly string[];
}

export interface ArtistIdentityEnrichment {
  readonly observedAt: string;
  readonly musicBrainzArtistId: string | null;
  readonly links: readonly ArtistIdentityLink[];
  readonly platformStatus: Readonly<Record<string, IdentityPlatformStatus>>;
  readonly shareReadiness: 'ready' | 'limited';
}

export type MusicBrainzMatchOutcome =
  | {
      readonly kind: 'matched';
      readonly mbid: string;
      readonly isrcCount: number;
    }
  | { readonly kind: 'conflicted'; readonly candidates: readonly string[] }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_checked'; readonly reason: string };

// Platforms enrichment can attest; `not_checked` distinguishes an unchecked
// source from a real negative for Ovie.
export const IDENTITY_ENRICHMENT_PLATFORMS = [
  'website',
  'instagram',
  'twitter',
  'tiktok',
  'youtube',
  'facebook',
  'bandcamp',
  'soundcloud',
  'twitch',
  'discord',
] as const;

/** Minimum distinct ISRCs backing one MB artist before it counts. */
const MIN_ISRC_SUPPORT = 2;
/** Bounded fetch cost per candidate (MusicBrainz is ~1 req/sec). */
const MAX_ISRCS_FOR_MATCHING = 8;
/** Minimum verified artist-controlled destinations for share readiness. */
const MIN_VERIFIED_DESTINATIONS = 2;

const MB_REL_TYPE_CONFIDENCE = 0.9;
const MB_SOCIAL_NETWORK_CONFIDENCE = 0.85;
const SPOTIFY_IDENTITY_CONFIDENCE = 1.0;
/** Two sources agreeing on one canonical identity bump confidence. */
const MULTI_SOURCE_BONUS = 0.05;

const SOCIAL_NETWORK_HOST_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'facebook',
  'youtube',
  'twitch',
  'discord',
  'bandcamp',
  'soundcloud',
]);

// Canonical dedupe identity for a platform + URL pair; falls back to
// host+path for ids outside the detection registry (e.g. `website`).
export function identityKeyForLink(platformId: string, url: string): string {
  const platform = getPlatform(platformId);
  const normalizedUrl = normalizeUrl(url);
  if (platform) {
    return canonicalIdentity({ platform, normalizedUrl });
  }
  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return `${platformId}:${host}${parsed.pathname.toLowerCase()}`;
  } catch {
    return `${platformId}:${normalizedUrl.toLowerCase()}`;
  }
}

// Map a url-rel to platform + normalized URL. Typed relations are trusted;
// generic `social network` rels classify by host (facebook.com → facebook).
// Unrecognized social-network hosts become websites, not platform guesses.
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

  const hostClassified =
    detected && SOCIAL_NETWORK_HOST_PLATFORMS.has(detected.id)
      ? { platform: detected.id, platformType: detected.category, url }
      : null;

  if (relationType === 'social network' || mapped === 'website') {
    return (
      hostClassified ?? { platform: 'website', platformType: 'websites', url }
    );
  }
  return {
    platform: mapped,
    platformType: detected?.category ?? 'social',
    url,
  };
}

interface ExtractedLink {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly canonicalIdentity: string;
  readonly confidence: number;
}

export function extractMusicBrainzIdentityLinks(artist: MusicBrainzArtist): {
  readonly links: readonly ExtractedLink[];
  readonly conflicts: Readonly<Record<string, readonly string[]>>;
} {
  const byIdentity = new Map<string, ExtractedLink>();
  const platformIdentities = new Map<string, Set<string>>();

  for (const relation of artist.relations ?? []) {
    if (relation.ended === true) continue;
    const resource = relation.url?.resource;
    if (!resource) continue;

    const classified = classifyMusicBrainzRelation(relation.type, resource);
    if (!classified) continue;

    const confidence =
      relation.type === 'social network'
        ? MB_SOCIAL_NETWORK_CONFIDENCE
        : MB_REL_TYPE_CONFIDENCE;
    const identity = identityKeyForLink(classified.platform, classified.url);

    const identities =
      platformIdentities.get(classified.platform) ?? new Set<string>();
    identities.add(identity);
    platformIdentities.set(classified.platform, identities);
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, {
        ...classified,
        canonicalIdentity: identity,
        confidence,
      });
    }
  }

  const conflicts: Record<string, readonly string[]> = {};
  const links: ExtractedLink[] = [];
  for (const link of byIdentity.values()) {
    const identities = platformIdentities.get(link.platform);
    if (identities && identities.size > 1) {
      conflicts[link.platform] = [...identities].sort();
    } else {
      links.push(link);
    }
  }
  return { links, conflicts };
}

// Exact entity pick: winner needs >= MIN_ISRC_SUPPORT distinct ISRCs plus a
// strict plurality; a tie is `conflicted`. Names are never consulted.
export function pickMusicBrainzArtistByIsrcSupport(
  recordings: readonly {
    readonly isrc: string;
    readonly artistIds: readonly string[];
  }[]
): MusicBrainzMatchOutcome {
  const support = new Map<string, Set<string>>();
  for (const recording of recordings) {
    for (const artistId of recording.artistIds) {
      const isrcs = support.get(artistId) ?? new Set<string>();
      isrcs.add(recording.isrc);
      support.set(artistId, isrcs);
    }
  }

  const ranked = [...support.entries()]
    .map(([mbid, isrcs]) => ({ mbid, count: isrcs.size }))
    .filter(entry => entry.count >= MIN_ISRC_SUPPORT)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) return { kind: 'not_found' };
  const top = ranked[0];
  const tied = ranked.filter(entry => entry.count === top.count);
  if (tied.length > 1) {
    return {
      kind: 'conflicted',
      candidates: tied.map(entry => entry.mbid).sort(),
    };
  }
  return { kind: 'matched', mbid: top.mbid, isrcCount: top.count };
}

export function deriveShareReadiness(
  platformStatus: Readonly<Record<string, IdentityPlatformStatus>>
): 'ready' | 'limited' {
  const statuses = Object.values(platformStatus);
  const verified = statuses.filter(s => s.status === 'verified').length;
  const conflicted = statuses.some(s => s.status === 'conflicted');
  if (conflicted) return 'limited';
  return verified >= MIN_VERIFIED_DESTINATIONS ? 'ready' : 'limited';
}

const SETTINGS_KEY = 'identityEnrichment';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function readArtistIdentityEnrichment(
  settings: unknown
): ArtistIdentityEnrichment | null {
  const record = asRecord(asRecord(settings)?.[SETTINGS_KEY]);
  if (
    !record ||
    typeof record.observedAt !== 'string' ||
    !Array.isArray(record.links) ||
    !asRecord(record.platformStatus) ||
    (record.shareReadiness !== 'ready' && record.shareReadiness !== 'limited')
  ) {
    return null;
  }
  return record as unknown as ArtistIdentityEnrichment;
}

/** Freshness guard: a record observed at/after `enrichedAfter` is kept. */
export function needsIdentityEnrichment(
  settings: unknown,
  enrichedAfter?: Date
): boolean {
  const existing = readArtistIdentityEnrichment(settings);
  if (!existing) return true;
  if (!enrichedAfter) return false;
  return new Date(existing.observedAt) < enrichedAfter;
}

export interface EnrichArtistIdentityInput {
  readonly spotifyId: string;
  readonly spotifyUrl: string;
  /** ISRCs from releases the registry artist is credited on. */
  readonly isrcs: readonly string[];
  readonly now?: Date;
}

export async function matchMusicBrainzArtistForIsrcs(
  isrcs: readonly string[]
): Promise<MusicBrainzMatchOutcome> {
  const bounded = isrcs.slice(0, MAX_ISRCS_FOR_MATCHING);
  if (bounded.length < MIN_ISRC_SUPPORT) {
    return { kind: 'not_checked', reason: 'insufficient_isrcs' };
  }

  // Lazy import keeps the server-only provider (rate limiter, circuit
  // breaker) out of this module's static graph.
  let provider: typeof import('@/lib/dsp-enrichment/providers/musicbrainz');
  try {
    provider = await import('@/lib/dsp-enrichment/providers/musicbrainz');
  } catch {
    return { kind: 'not_checked', reason: 'musicbrainz_unavailable' };
  }
  if (!provider.isMusicBrainzAvailable()) {
    return { kind: 'not_checked', reason: 'musicbrainz_unavailable' };
  }

  const recordings: { isrc: string; artistIds: string[] }[] = [];
  try {
    for (const isrc of bounded) {
      const results = await provider.lookupMusicBrainzByIsrc(isrc);
      const artistIds = (results[0]?.['artist-credit'] ?? [])
        .map(credit => credit.artist?.id)
        .filter((id): id is string => Boolean(id));
      recordings.push({ isrc, artistIds });
    }
  } catch (error) {
    logger.warn('MusicBrainz identity match failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: 'not_checked', reason: 'musicbrainz_error' };
  }

  return pickMusicBrainzArtistByIsrcSupport(recordings);
}

export async function enrichArtistIdentity(
  input: EnrichArtistIdentityInput
): Promise<ArtistIdentityEnrichment> {
  const observedAt = (input.now ?? new Date()).toISOString();
  const links: ArtistIdentityLink[] = [];
  const perPlatformSources = new Map<string, Set<IdentityLinkSource>>();

  const addLink = (link: ArtistIdentityLink) => {
    links.push(link);
    const sources = perPlatformSources.get(link.platform) ?? new Set();
    sources.add(link.source);
    perPlatformSources.set(link.platform, sources);
  };

  // Spotify: exact provider identity, always verified.
  addLink({
    platform: 'spotify',
    platformType: 'dsp',
    url: input.spotifyUrl,
    canonicalIdentity: identityKeyForLink('spotify', input.spotifyUrl),
    confidence: SPOTIFY_IDENTITY_CONFIDENCE,
    source: 'spotify',
    sourceEntityId: input.spotifyId,
  });

  // MusicBrainz: exact-entity match by shared ISRCs.
  const match = await matchMusicBrainzArtistForIsrcs(input.isrcs);
  let musicBrainzArtistId: string | null = null;
  const mbConflicts: Record<string, readonly string[]> = {};
  let mbChecked = false;

  if (match.kind === 'matched') {
    try {
      const provider = await import(
        '@/lib/dsp-enrichment/providers/musicbrainz'
      );
      const artist = await provider.getMusicBrainzArtist(match.mbid);
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
        Object.assign(mbConflicts, extracted.conflicts);
      }
      mbChecked = true;
    } catch (error) {
      logger.warn('MusicBrainz artist url-rel fetch failed', {
        mbid: match.mbid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (match.kind === 'not_found' || match.kind === 'conflicted') {
    mbChecked = true;
  }

  // Dedupe by canonical identity; cross-source agreement raises confidence.
  const deduped = new Map<string, ArtistIdentityLink>();
  for (const link of links) {
    const existing = deduped.get(link.canonicalIdentity);
    if (!existing) {
      deduped.set(link.canonicalIdentity, link);
    } else if (link.source !== existing.source) {
      deduped.set(link.canonicalIdentity, {
        ...existing,
        confidence: Math.min(
          1,
          Math.max(existing.confidence, link.confidence) + MULTI_SOURCE_BONUS
        ),
      });
    }
  }

  const verifiedPlatforms = new Set(
    [...deduped.values()].map(link => link.platform)
  );
  const platformStatus: Record<string, IdentityPlatformStatus> = {
    spotify: { status: 'verified', observedAt, sources: ['spotify'] },
  };

  for (const platform of IDENTITY_ENRICHMENT_PLATFORMS) {
    if (verifiedPlatforms.has(platform)) {
      platformStatus[platform] = {
        status: 'verified',
        observedAt,
        sources: [...(perPlatformSources.get(platform) ?? [])],
      };
    } else if (mbConflicts[platform]) {
      platformStatus[platform] = {
        status: 'conflicted',
        observedAt,
        sources: ['musicbrainz'],
        conflicts: mbConflicts[platform],
      };
    } else {
      platformStatus[platform] = mbChecked
        ? { status: 'not_found', observedAt, sources: ['musicbrainz'] }
        : { status: 'not_checked', observedAt, sources: [] };
    }
  }

  if (match.kind === 'conflicted') {
    platformStatus.musicbrainz = {
      status: 'conflicted',
      observedAt,
      sources: ['musicbrainz'],
      conflicts: match.candidates,
    };
  }

  return {
    observedAt,
    musicBrainzArtistId,
    links: [...deduped.values()],
    platformStatus,
    shareReadiness: deriveShareReadiness(platformStatus),
  };
}

// Insert-only, idempotent apply inside the identity-bound transaction:
// existing canonical identities are skipped and jsonb_set preserves other
// settings keys.
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

  const now = new Date();
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
        displayText: '',
        sortOrder,
        isActive: true,
        state: 'active',
        confidence: link.confidence.toFixed(2),
        sourcePlatform: link.source,
        sourceType: 'ingested',
        evidence: {
          sources: ['artist_identity_enrichment', link.source],
          signals: [link.sourceEntityId, link.canonicalIdentity],
        },
        verificationStatus: 'unverified',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    existingIdentities.add(link.canonicalIdentity);
    inserted += 1;
    sortOrder += 1;
  }

  // jsonb_set touches only the identityEnrichment key; claimed markers and
  // unrelated settings are preserved.
  await tx.execute(drizzleSql`
    UPDATE ${creatorProfiles}
    SET
      settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{${drizzleSql.raw(SETTINGS_KEY)}}',
        ${drizzleSql.raw(`'${JSON.stringify(enrichment).replaceAll("'", "''")}'`)}::jsonb
      ),
      updated_at = NOW()
    WHERE id = ${profileId}
  `);

  return { inserted };
}
