/**
 * Bounded identity enrichment for exact provider-ID-backed unclaimed artists
 * (JOV-6529). Chain: Spotify artist URL -> MusicBrainz URL entity -> MBID ->
 * url-rels, corroborated by the official homepage's outbound links. Identity
 * binds only on exact provider IDs; display-name similarity is never used.
 * Conflicts are recorded, never silently resolved; ended rels are dropped.
 */

import 'server-only';

import { and, eq } from 'drizzle-orm';

import { type DbOrTransaction, db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  findMusicBrainzArtistIdsByUrl,
  getMusicBrainzArtist,
  isMusicBrainzAvailable,
} from '@/lib/dsp-enrichment/providers/musicbrainz';
import type { MusicBrainzRelation } from '@/lib/dsp-enrichment/types';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import type { UnclaimedArtistEnrichmentReceipt } from '@/lib/profile/unclaimed-artist-profile';
import {
  getUnclaimedArtistEnrichmentStatus,
  isUnclaimedStructuredCreditProfile,
  recordUnclaimedArtistEnrichment,
} from '@/lib/profile/unclaimed-artist-profile';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatformByHost,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import { extractHandleFromUrl } from '@/lib/utils/social-platform';

export const ENRICHMENT_SOURCE_SPOTIFY = 'spotify_artist';
export const ENRICHMENT_SOURCE_MUSICBRAINZ = 'musicbrainz_url_rel';
export const ENRICHMENT_SOURCE_OFFICIAL_SITE = 'official_site';

export type EnrichmentLinkStatus = 'verified' | 'unverified' | 'conflicted';

export interface EnrichedDestination {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly canonicalId: string;
  readonly sources: readonly string[];
  readonly status: EnrichmentLinkStatus;
}

export interface UnclaimedArtistIdentityEvidence {
  readonly checkedAt: string;
  readonly musicbrainzId: string | null;
  readonly destinations: readonly EnrichedDestination[];
  readonly conflicts: readonly string[];
  readonly sources: readonly string[];
  readonly handleCandidates: readonly string[];
}

// Artist-controlled MusicBrainz url-rel types only; metadata refs (wikidata,
// discogs, lyrics, streaming/purchase, label/fan rels) are excluded.
const ARTIST_CONTROLLED_REL_TYPES = new Set([
  'official homepage',
  'social network',
  'youtube',
  'video channel',
  'twitter',
  'facebook',
  'instagram',
  'tiktok',
  'twitch',
  'discord',
  'bandcamp',
  'soundcloud',
  'bandsintown',
  'blog',
]);

/** Spotify identity is already exact; never re-derive it. */
const SKIP_PLATFORM_IDS = new Set(['spotify']);

const OFFICIAL_SITE_TIMEOUT_MS = 8_000;
const OFFICIAL_SITE_MAX_BYTES = 512 * 1024;
const MAX_HOMEPAGE_FETCHES = 2;
const MAX_MBIDS = 2;
const MAX_DESTINATIONS = 24;

interface ClassifiedLink {
  readonly platform: string;
  readonly platformType: string;
  readonly url: string;
  readonly canonicalId: string;
  readonly source: string;
}

function classifyDestinationUrl(
  rawUrl: string,
  source: string
): ClassifiedLink | null {
  const platformInfo = detectPlatformByHost(rawUrl);
  if (!platformInfo || SKIP_PLATFORM_IDS.has(platformInfo.id)) return null;
  const normalizedUrl = normalizeUrl(rawUrl);
  return {
    platform: platformInfo.id,
    platformType: platformInfo.icon,
    url: normalizedUrl,
    canonicalId: canonicalIdentity({ platform: platformInfo, normalizedUrl }),
    source,
  };
}

function classifyOfficialHomepage(rawUrl: string): ClassifiedLink | null {
  try {
    const normalizedUrl = normalizeUrl(rawUrl);
    const host = new URL(normalizedUrl).hostname
      .replace(/^www\./, '')
      .toLowerCase();
    return {
      platform: 'website',
      platformType: 'link',
      url: normalizedUrl,
      canonicalId: `website:${host}`,
      source: ENRICHMENT_SOURCE_MUSICBRAINZ,
    };
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Ended rels are stale identities (dropped); non-allowlisted types never leak in.
export function extractMusicBrainzDestinations(
  relations: readonly MusicBrainzRelation[] | undefined
): ClassifiedLink[] {
  const out: ClassifiedLink[] = [];
  for (const rel of relations ?? []) {
    if (!rel.type || !ARTIST_CONTROLLED_REL_TYPES.has(rel.type)) continue;
    if (rel.ended === true || rel.end) continue;
    const resource = rel.url?.resource;
    if (!resource) continue;
    // "official homepage" may point at a known hub; classify by host first.
    const link =
      classifyDestinationUrl(resource, ENRICHMENT_SOURCE_MUSICBRAINZ) ??
      (rel.type === 'official homepage'
        ? classifyOfficialHomepage(resource)
        : null);
    if (link) out.push(link);
  }
  return out;
}

const HREF_PATTERN = /href=["']([^"'<>]+)["']/gi;

/** Outbound social links on the artist's own site — an independent source. */
export function extractOutboundSocialLinks(
  html: string,
  siteHost: string
): ClassifiedLink[] {
  const links: ClassifiedLink[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(HREF_PATTERN)) {
    const href = match[1];
    if (!href?.startsWith('http')) continue;
    const host = hostOf(href);
    if (!host || host === siteHost) continue;
    const link = classifyDestinationUrl(href, ENRICHMENT_SOURCE_OFFICIAL_SITE);
    if (!link || seen.has(link.canonicalId)) continue;
    seen.add(link.canonicalId);
    links.push(link);
    if (links.length >= MAX_DESTINATIONS) break;
  }
  return links;
}

async function fetchOutboundLinks(
  homepageUrl: string
): Promise<ClassifiedLink[]> {
  const host = hostOf(homepageUrl);
  if (!host) return [];
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OFFICIAL_SITE_TIMEOUT_MS
  );
  try {
    const response = await fetch(homepageUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Jovie-IdentityEnrichment/1.0 (https://jov.ie)',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return [];
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      chunks.push(value);
      if (received >= OFFICIAL_SITE_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    const html = new TextDecoder().decode(
      await new Blob(chunks as BlobPart[]).arrayBuffer()
    );
    return extractOutboundSocialLinks(html, host);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Two-source destinations are `verified`, single-source `unverified`;
// multiple distinct official domains mark the website field `conflicted`.
export function mergeDestinations(observed: readonly ClassifiedLink[]): {
  destinations: EnrichedDestination[];
  conflicts: string[];
} {
  const byCanonical = new Map<
    string,
    { link: ClassifiedLink; sources: Set<string> }
  >();
  for (const link of observed) {
    const existing = byCanonical.get(link.canonicalId);
    if (existing) existing.sources.add(link.source);
    else
      byCanonical.set(link.canonicalId, {
        link,
        sources: new Set([link.source]),
      });
  }

  const conflicts: string[] = [];
  const destinations: EnrichedDestination[] = [];
  for (const { link, sources } of byCanonical.values()) {
    destinations.push({
      platform: link.platform,
      platformType: link.platformType,
      url: link.url,
      canonicalId: link.canonicalId,
      sources: [...sources].sort(),
      status: sources.size > 1 ? 'verified' : 'unverified',
    });
  }

  const websites = destinations.filter(d => d.platform === 'website');
  if (websites.length > 1) {
    const domains = websites.map(w => hostOf(w.url)).sort();
    conflicts.push(`multiple official domains: ${domains.join(', ')}`);
    for (const dest of websites) {
      (dest as { status: EnrichmentLinkStatus }).status = 'conflicted';
    }
  }

  destinations.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  return { destinations, conflicts };
}

function deriveHandleCandidates(
  destinations: readonly EnrichedDestination[]
): string[] {
  const handles = new Set<string>();
  for (const dest of destinations) {
    if (dest.status === 'conflicted') continue;
    if (dest.platform === 'website') {
      const stem = hostOf(dest.url)?.split('.')[0];
      if (stem) handles.add(stem);
      continue;
    }
    const handle = extractHandleFromUrl(dest.url);
    if (handle) handles.add(handle.replace(/^@/, '').toLowerCase());
  }
  return [...handles].sort();
}

// `shareReady` = minimum evidence contract: no conflicts AND (>=1 verified
// destination or >=2 exact-ID-corroborated destinations).
export function buildEnrichmentReceipt(
  evidence: Omit<UnclaimedArtistIdentityEvidence, 'handleCandidates'>
): UnclaimedArtistEnrichmentReceipt {
  const severity = { conflicted: 3, verified: 2, unverified: 1 } as const;
  const fields: Record<string, 'verified' | 'unverified' | 'conflicted'> = {};
  for (const dest of evidence.destinations) {
    const prev = fields[dest.platform];
    if (!prev || severity[dest.status] > severity[prev]) {
      fields[dest.platform] = dest.status;
    }
  }

  const verifiedCount = Object.values(fields).filter(
    state => state === 'verified'
  ).length;
  const status: UnclaimedArtistEnrichmentReceipt['status'] =
    evidence.conflicts.length > 0
      ? 'conflicted'
      : evidence.destinations.length === 0
        ? 'not_found'
        : 'verified';

  return {
    status,
    checkedAt: evidence.checkedAt,
    sources: evidence.sources,
    fields,
    conflicts: evidence.conflicts,
    musicbrainzId: evidence.musicbrainzId,
    shareReady:
      evidence.conflicts.length === 0 &&
      (verifiedCount >= 1 || evidence.destinations.length >= 2),
  };
}

// Returns null when no source is reachable: `not_checked`, not `not_found`.
export async function discoverUnclaimedArtistIdentity(
  spotifyId: string
): Promise<UnclaimedArtistIdentityEvidence | null> {
  if (!isMusicBrainzAvailable()) return null;

  const spotifyUrl = buildSpotifyArtistUrl(spotifyId);
  const sources = new Set<string>([ENRICHMENT_SOURCE_SPOTIFY]);
  const conflicts: string[] = [];
  const observed: ClassifiedLink[] = [];

  let mbids: string[];
  try {
    mbids = await findMusicBrainzArtistIdsByUrl(spotifyUrl);
  } catch (error) {
    logger.warn('Unclaimed artist enrichment: MusicBrainz URL lookup failed', {
      spotifyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  let primaryMbid: string | null = null;
  if (mbids.length > 0) {
    sources.add(ENRICHMENT_SOURCE_MUSICBRAINZ);
    primaryMbid = mbids[0] ?? null;
    if (mbids.length > 1) {
      conflicts.push(
        `multiple MusicBrainz entities claim ${spotifyUrl}: ${mbids.join(', ')}`
      );
    }
    for (const mbid of mbids.slice(0, MAX_MBIDS)) {
      try {
        const artist = await getMusicBrainzArtist(mbid);
        observed.push(...extractMusicBrainzDestinations(artist?.relations));
      } catch (error) {
        logger.warn('Unclaimed artist enrichment: MusicBrainz artist failed', {
          spotifyId,
          mbid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const homepages = observed.filter(link => link.platform === 'website');
  for (const homepage of homepages.slice(0, MAX_HOMEPAGE_FETCHES)) {
    const outbound = await fetchOutboundLinks(homepage.url);
    if (outbound.length > 0) {
      sources.add(ENRICHMENT_SOURCE_OFFICIAL_SITE);
      observed.push(...outbound);
    }
  }

  const merged = mergeDestinations(observed);
  conflicts.push(...merged.conflicts);

  const partial = {
    checkedAt: new Date().toISOString(),
    musicbrainzId: primaryMbid,
    destinations: merged.destinations,
    conflicts,
    sources: [...sources].sort(),
  };

  return {
    ...partial,
    handleCandidates: deriveHandleCandidates(merged.destinations),
  };
}

// Insert-only and idempotent: existing rows are never overwritten.
export async function persistEnrichmentDestinations(
  tx: DbOrTransaction,
  creatorProfileId: string,
  spotifyId: string,
  evidence: UnclaimedArtistIdentityEvidence
): Promise<number> {
  const insertable = evidence.destinations.filter(
    dest => dest.status !== 'conflicted'
  );
  if (insertable.length === 0) return 0;

  const now = new Date();
  await tx
    .insert(socialLinks)
    .values(
      insertable.map((dest, index) => ({
        creatorProfileId,
        platform: dest.platform,
        platformType: dest.platformType,
        url: dest.url,
        displayText: '',
        sortOrder: index + 1,
        isActive: true,
        state: 'active' as const,
        confidence: dest.status === 'verified' ? '0.95' : '0.80',
        sourcePlatform: 'identity_enrichment',
        sourceType: 'ingested' as const,
        evidence: {
          sources: [ENRICHMENT_SOURCE_SPOTIFY, ...dest.sources],
          signals: [
            spotifyId,
            dest.canonicalId,
            `observed:${evidence.checkedAt}`,
            ...(evidence.musicbrainzId
              ? [`mbid:${evidence.musicbrainzId}`]
              : []),
          ],
        },
        verificationStatus:
          dest.status === 'verified' ? 'verified' : 'unverified',
        verificationCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
  return insertable.length;
}

// Idempotent backfill; no-ops on claimed profiles or foreign markers.
export async function enrichUnclaimedArtistProfile(
  creatorProfileId: string
): Promise<{ status: 'enriched' | 'skipped' | 'conflicted' }> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
      isClaimed: creatorProfiles.isClaimed,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (
    !profile?.spotifyId ||
    profile.isClaimed ||
    !isUnclaimedStructuredCreditProfile(profile.settings) ||
    getUnclaimedArtistEnrichmentStatus(profile.settings) !== 'not_checked'
  ) {
    return { status: 'skipped' };
  }

  const evidence = await discoverUnclaimedArtistIdentity(profile.spotifyId);
  if (!evidence) return { status: 'skipped' };

  const receipt = buildEnrichmentReceipt(evidence);

  await withSystemIngestionSession(async tx => {
    const [locked] = await tx
      .select({
        isClaimed: creatorProfiles.isClaimed,
        settings: creatorProfiles.settings,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, creatorProfileId))
      .for('update')
      .limit(1);

    if (
      !locked ||
      locked.isClaimed ||
      !isUnclaimedStructuredCreditProfile(locked.settings)
    ) {
      return;
    }

    await persistEnrichmentDestinations(
      tx,
      creatorProfileId,
      profile.spotifyId!,
      evidence
    );
    await tx
      .update(creatorProfiles)
      .set({
        settings: recordUnclaimedArtistEnrichment(
          (locked.settings ?? {}) as Record<string, unknown>,
          receipt
        ),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creatorProfiles.id, creatorProfileId),
          eq(creatorProfiles.isClaimed, false)
        )
      );
  });

  return {
    status: receipt.status === 'conflicted' ? 'conflicted' : 'enriched',
  };
}
