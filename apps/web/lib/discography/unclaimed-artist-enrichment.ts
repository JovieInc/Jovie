/**
 * Bounded identity enrichment for exact provider-ID-backed unclaimed artist
 * profiles (JOV-6529).
 *
 * Before this stage, structured-credit reconciliation published a public
 * profile holding only the Spotify social-link row. This module adds the
 * pre-share-ready enrichment pass:
 *
 *   1. MusicFetch artist lookup keyed by the exact Spotify artist URL —
 *      resolves artist-controlled DSP destinations and the MusicBrainz MBID.
 *   2. MusicBrainz url-rels keyed by that exact MBID — resolves the
 *      artist-controlled official homepage and supported social links.
 *
 * Every destination carries per-field provenance, observed time, and
 * confidence. Links are normalized and de-duped by canonical identity via
 * `normalizeAndMergeExtraction`. Ownership is never inferred from
 * display-name similarity: the only match keys are the exact Spotify artist
 * ID and the provider-resolved MBID.
 */

import 'server-only';

import {
  and,
  asc,
  sql as drizzleSql,
  eq,
  gt,
  isNotNull,
  ne,
} from 'drizzle-orm';

import { type DbOrTransaction, db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { extractMusicFetchLinks } from '@/lib/dsp-enrichment/musicfetch-mapping';
import { getMusicBrainzArtist } from '@/lib/dsp-enrichment/providers/musicbrainz';
import {
  fetchArtistBySpotifyUrl,
  getMusicFetchServiceUrl,
  type MusicFetchArtistResult,
} from '@/lib/dsp-enrichment/providers/musicfetch';
import {
  MUSICBRAINZ_URL_TYPE_MAP,
  type MusicBrainzArtist,
} from '@/lib/dsp-enrichment/types';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';
import { normalizeAndMergeExtraction } from '@/lib/ingestion/merge';
import { getCanonicalIdentity } from '@/lib/ingestion/services/link-deduplication';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import type { ExtractedLink } from '@/lib/ingestion/types';
import {
  buildIdentityEnrichmentReceipt,
  type EnrichedDestination,
  type IdentityEnrichmentConflict,
  type IdentityEnrichmentReceipt,
  readIdentityEnrichmentReceipt,
  withIdentityEnrichmentReceipt,
} from '@/lib/profile/identity-enrichment';
import { isUnclaimedStructuredCreditProfile } from '@/lib/profile/unclaimed-artist-profile';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';

const MUSICBRAINZ_MBID_FROM_URL = /musicbrainz\.org\/artist\/([0-9a-f-]{36})/i;

/**
 * What the network discovery stage resolved. `checkedSources` records which
 * trusted sources were actually consulted so `not_checked` stays
 * distinguishable from `not_found`.
 */
export interface UnclaimedArtistDiscovery {
  readonly spotifyUrl: string;
  readonly spotifyId: string;
  readonly musicfetch: MusicFetchArtistResult | null;
  readonly musicbrainz: MusicBrainzArtist | null;
  readonly checkedSources: string[];
}

export interface IdentityEnrichmentPlan {
  /** Links to merge into social_links with full evidence provenance. */
  readonly links: ExtractedLink[];
  /** Receipt destinations — deduped by canonical identity. */
  readonly destinations: EnrichedDestination[];
  readonly conflicts: IdentityEnrichmentConflict[];
  /** Verified social handles the friendly-handle composer may rank. */
  readonly identityHandles: string[];
}

/**
 * Run the bounded network stage outside any transaction.
 *
 * Failures degrade to a null source payload, never to a throw: enrichment
 * must not fail profile publication closed. Sources that were not consulted
 * are simply absent from `checkedSources`.
 */
export async function discoverUnclaimedArtistIdentity(
  spotifyId: string
): Promise<UnclaimedArtistDiscovery> {
  const spotifyUrl = buildSpotifyArtistUrl(spotifyId);
  const checkedSources: string[] = [];

  let musicfetch: MusicFetchArtistResult | null = null;
  try {
    musicfetch = await fetchArtistBySpotifyUrl(spotifyUrl);
    checkedSources.push('musicfetch');
  } catch (error) {
    logger.warn('Unclaimed artist enrichment: MusicFetch lookup failed', {
      spotifyId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  let musicbrainz: MusicBrainzArtist | null = null;
  const mbid = extractMusicBrainzId(musicfetch);
  if (mbid) {
    try {
      musicbrainz = await getMusicBrainzArtist(mbid);
      checkedSources.push('musicbrainz');
    } catch (error) {
      logger.warn('Unclaimed artist enrichment: MusicBrainz lookup failed', {
        spotifyId,
        mbid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { spotifyUrl, spotifyId, musicfetch, musicbrainz, checkedSources };
}

/** Resolve the exact MBID MusicFetch bound to this Spotify artist. */
function extractMusicBrainzId(
  artistData: MusicFetchArtistResult | null
): string | null {
  const service = artistData?.services?.musicBrainz;
  if (!service) return null;
  if (service.id) return service.id;
  const url = getMusicFetchServiceUrl(service);
  return url ? (MUSICBRAINZ_MBID_FROM_URL.exec(url)?.[1] ?? null) : null;
}

/**
 * Map one MusicBrainz url-rel to a supported destination. `social network`
 * relations resolve their concrete platform by URL; unresolvable relations
 * (e.g. fan pages, label pages, second wikidata pointers) are skipped so
 * only artist-controlled destinations are merged.
 */
function mapMusicBrainzRelation(
  relation: NonNullable<MusicBrainzArtist['relations']>[number]
): { url: string; platformId: string } | null {
  const url = relation.url?.resource;
  if (!url || relation.direction === 'backward') return null;

  const mapped = MUSICBRAINZ_URL_TYPE_MAP[relation.type];
  if (!mapped) return null;

  // Wikidata is an identifier, not an artist-controlled destination — the
  // entity layer already records it via resolveEntityIds.
  if (relation.type === 'wikidata') return null;

  const detected = detectPlatform(url);

  // Official homepages live on arbitrary artist domains that the
  // platform detector intentionally does not recognize as publishable
  // social_links. They remain evidence-level destinations in the receipt
  // and the identity layer rather than being dropped entirely.
  if (mapped === 'website') {
    return { url: detected.normalizedUrl, platformId: 'website' };
  }

  if (!detected.isValid) return null;
  return { url: detected.normalizedUrl, platformId: detected.platform.id };
}

/** Canonical identity for destinations, including non-registry websites. */
function canonicalFor(platformId: string, url: string): string | null {
  const canonical = getCanonicalIdentity(url);
  if (canonical) return canonical;
  if (platformId === 'website') {
    try {
      return `website:${new URL(url).hostname.toLowerCase().replace(/^www\./, '')}`;
    } catch {
      return null;
    }
  }
  return null;
}

/** Extract a handle candidate from a verified social destination URL. */
function extractSocialHandle(url: string): string | null {
  try {
    const first = new URL(url).pathname.split('/').find(Boolean);
    return first?.replace(/^@/, '').toLowerCase() ?? null;
  } catch {
    return null;
  }
}

const SOCIAL_HANDLE_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'facebook',
  'youtube',
]);

/**
 * Turn a discovery payload into a merge plan + receipt evidence.
 * Pure — deterministic for a given discovery payload and clock.
 */
export function buildIdentityEnrichmentPlan(
  discovery: UnclaimedArtistDiscovery,
  options?: { observedAt?: string }
): IdentityEnrichmentPlan {
  const observedAt = options?.observedAt ?? new Date().toISOString();
  const candidates: Array<{
    link: ExtractedLink;
    platformId: string;
    source: string;
  }> = [];

  if (discovery.musicfetch) {
    for (const link of extractMusicFetchLinks(
      discovery.musicfetch,
      discovery.spotifyUrl,
      'musicfetch_artist_lookup'
    )) {
      const detected = detectPlatform(link.url);
      if (!detected.isValid) continue;
      candidates.push({
        link: { ...link, url: detected.normalizedUrl },
        platformId: detected.platform.id,
        source: 'musicfetch',
      });
    }
  }

  if (discovery.musicbrainz) {
    for (const relation of discovery.musicbrainz.relations ?? []) {
      const mapped = mapMusicBrainzRelation(relation);
      if (!mapped) continue;
      candidates.push({
        link: {
          url: mapped.url,
          platformId: mapped.platformId,
          sourcePlatform: 'musicbrainz',
          evidence: {
            sources: ['musicbrainz'],
            signals: ['musicbrainz_url_rel'],
          },
        },
        platformId: mapped.platformId,
        source: 'musicbrainz',
      });
    }
  }

  // Normalize + dedupe by canonical identity. When two trusted sources
  // disagree on the same platform (different canonical URLs), neither side
  // is auto-published: the platform is recorded as a conflict instead of a
  // silent pick. Source agreement on one canonical URL just merges evidence.
  const byPlatform = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = byPlatform.get(candidate.platformId) ?? [];
    group.push(candidate);
    byPlatform.set(candidate.platformId, group);
  }

  const links: ExtractedLink[] = [];
  const destinations: EnrichedDestination[] = [];
  const conflicts: IdentityEnrichmentConflict[] = [];
  const identityHandles: string[] = [];

  for (const [platformId, group] of byPlatform) {
    const byCanonical = new Map<string, typeof group>();
    for (const candidate of group) {
      const canonical = canonicalFor(platformId, candidate.link.url);
      if (!canonical) continue;
      const same = byCanonical.get(canonical) ?? [];
      same.push(candidate);
      byCanonical.set(canonical, same);
    }

    if (byCanonical.size > 1) {
      conflicts.push({
        platform: platformId,
        urls: group.map(candidate => candidate.link.url),
        reason: 'source_disagreement',
      });
      for (const candidates of byCanonical.values()) {
        for (const candidate of candidates) {
          destinations.push({
            platform: platformId,
            url: candidate.link.url,
            state: 'conflicted',
            confidence: 0,
            source: candidate.source,
            observedAt,
            providerMatch: 'exact_provider_id',
          });
        }
      }
      continue;
    }

    const [canonical, agreed] = [...byCanonical.entries()][0] ?? [];
    if (!canonical || !agreed?.length) continue;

    const mergedEvidence = {
      sources: [
        ...new Set(agreed.flatMap(c => c.link.evidence?.sources ?? [])),
      ],
      signals: [
        ...new Set(agreed.flatMap(c => c.link.evidence?.signals ?? [])),
      ],
    };
    const first = agreed[0]!;
    const { confidence, state } = computeLinkConfidence({
      sourceType: 'ingested',
      signals: mergedEvidence.signals,
      sources: mergedEvidence.sources,
      url: first.link.url,
    });

    // `website` destinations are evidence-only: the link model does not
    // publish arbitrary artist domains to social_links today.
    if (platformId !== 'website') {
      links.push({
        ...first.link,
        evidence: mergedEvidence,
      });
    }
    destinations.push({
      platform: platformId,
      url: first.link.url,
      state,
      confidence,
      source: agreed.map(candidate => candidate.source).join('+'),
      observedAt,
      providerMatch: 'exact_provider_id',
    });

    if (state === 'active' && SOCIAL_HANDLE_PLATFORMS.has(platformId)) {
      const handle = extractSocialHandle(first.link.url);
      if (handle) identityHandles.push(handle);
    }
  }

  return { links, destinations, conflicts, identityHandles };
}

interface EnrichableProfileRow {
  readonly id: string;
  readonly settings: Record<string, unknown> | null;
  readonly isClaimed: boolean | null;
  readonly usernameNormalized: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly displayNameLocked: boolean | null;
  readonly avatarLockedByUser: boolean | null;
  readonly musicbrainzId: string | null;
}

/**
 * Detect disagreements between freshly discovered destinations and social
 * links already stored on the profile (e.g. a stale handle written by an
 * earlier pass). A stored active/suggested link for the same platform whose
 * canonical identity differs from the discovered one is a conflict; the
 * stored row is never overwritten here.
 */
async function detectExistingLinkConflicts(
  tx: DbOrTransaction,
  profileId: string,
  destinations: EnrichedDestination[]
): Promise<IdentityEnrichmentConflict[]> {
  if (destinations.length === 0) return [];

  const rows = await tx
    .select({
      platform: socialLinks.platform,
      url: socialLinks.url,
      state: socialLinks.state,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        ne(socialLinks.state, 'rejected')
      )
    );

  const conflicts: IdentityEnrichmentConflict[] = [];
  const discoveredByPlatform = new Map<string, EnrichedDestination>();
  for (const destination of destinations) {
    if (destination.state === 'conflicted') continue;
    discoveredByPlatform.set(destination.platform, destination);
  }

  for (const row of rows) {
    const discovered = discoveredByPlatform.get(row.platform);
    if (!discovered) continue;
    const storedCanonical = getCanonicalIdentity(row.url);
    const discoveredCanonical = getCanonicalIdentity(discovered.url);
    if (
      storedCanonical &&
      discoveredCanonical &&
      storedCanonical !== discoveredCanonical
    ) {
      conflicts.push({
        platform: row.platform,
        urls: [row.url, discovered.url],
        reason: 'existing_link_mismatch',
      });
      discoveredByPlatform.delete(row.platform);
    }
  }

  return conflicts;
}

/**
 * Apply one discovery payload to a profile inside the caller's transaction:
 * merge canonical links into social_links and write the enrichment receipt
 * into profile settings.
 *
 * Idempotent — the merge dedupes by canonical identity and the receipt is a
 * deterministic projection of the discovery payload, so existing unclaimed
 * profiles can be backfilled by re-running this function.
 *
 * Claimed profiles and locked fields are never touched: claimed profiles
 * return early, and the merge layer honors display-name/avatar locks.
 */
export async function applyUnclaimedArtistIdentityEnrichment(
  tx: DbOrTransaction,
  profile: EnrichableProfileRow,
  discovery: UnclaimedArtistDiscovery
): Promise<IdentityEnrichmentReceipt | null> {
  // Only structured-credit unclaimed profiles are enriched by this path.
  // A claimed (or non-marker) profile owns its identity — never rewrite it.
  if (
    profile.isClaimed === true ||
    !isUnclaimedStructuredCreditProfile(profile.settings)
  ) {
    return readIdentityEnrichmentReceipt(profile.settings);
  }

  const plan = buildIdentityEnrichmentPlan(discovery);
  const passExecuted = discovery.checkedSources.length > 0;

  if (plan.links.length > 0) {
    await normalizeAndMergeExtraction(
      tx,
      {
        id: profile.id,
        usernameNormalized: profile.usernameNormalized,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        avatarLockedByUser: profile.avatarLockedByUser,
        displayNameLocked: profile.displayNameLocked,
      },
      {
        links: plan.links,
        sourcePlatform: 'unclaimed_identity_enrichment',
        sourceUrl: discovery.spotifyUrl,
      }
    );
  }

  const existingConflicts = await detectExistingLinkConflicts(
    tx,
    profile.id,
    plan.destinations
  );
  const conflicts = [...plan.conflicts, ...existingConflicts];
  const conflictedPlatforms = new Set(conflicts.map(c => c.platform));
  const destinations = plan.destinations.map(destination =>
    conflictedPlatforms.has(destination.platform) &&
    destination.state !== 'conflicted'
      ? { ...destination, state: 'conflicted' as const }
      : destination
  );

  const receipt = buildIdentityEnrichmentReceipt({
    providerArtistId: discovery.spotifyId,
    discoverySources: discovery.checkedSources,
    destinations,
    conflicts,
    passExecuted,
  });

  const mbid = extractMusicBrainzId(discovery.musicfetch);
  await tx
    .update(creatorProfiles)
    .set({
      settings: withIdentityEnrichmentReceipt(profile.settings, receipt),
      ...(mbid && !profile.musicbrainzId ? { musicbrainzId: mbid } : {}),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id));

  return receipt;
}

/**
 * Public handle candidates contributed by verified identity destinations.
 * The friendly-handle composer consumes these as evidence; model output is
 * never authoritative — these come only from exact provider-ID lookups.
 */
export function extractIdentityHandles(
  discovery: UnclaimedArtistDiscovery
): string[] {
  return buildIdentityEnrichmentPlan(discovery).identityHandles;
}

const ENRICHABLE_PROFILE_SELECT = {
  id: creatorProfiles.id,
  settings: creatorProfiles.settings,
  isClaimed: creatorProfiles.isClaimed,
  spotifyId: creatorProfiles.spotifyId,
  usernameNormalized: creatorProfiles.usernameNormalized,
  displayName: creatorProfiles.displayName,
  avatarUrl: creatorProfiles.avatarUrl,
  displayNameLocked: creatorProfiles.displayNameLocked,
  avatarLockedByUser: creatorProfiles.avatarLockedByUser,
  musicbrainzId: creatorProfiles.musicbrainzId,
} as const;

/**
 * Re-run the enrichment pass for one already-materialized unclaimed
 * structured-credit profile. Idempotent — safe to call repeatedly.
 */
export async function enrichExistingUnclaimedArtistProfile(
  creatorProfileId: string
): Promise<IdentityEnrichmentReceipt | null> {
  const [profile] = await db
    .select(ENRICHABLE_PROFILE_SELECT)
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (
    !profile?.spotifyId ||
    profile.isClaimed === true ||
    !isUnclaimedStructuredCreditProfile(profile.settings)
  ) {
    return null;
  }

  const discovery = await discoverUnclaimedArtistIdentity(profile.spotifyId);
  return withSystemIngestionSession(tx =>
    applyUnclaimedArtistIdentityEnrichment(tx, profile, discovery)
  );
}

export interface UnclaimedEnrichmentBackfillSummary {
  readonly scanned: number;
  readonly enriched: number;
  readonly skipped: number;
  readonly failed: number;
  readonly nextCursor: string | null;
}

const UNCLAIMED_MARKER_FILTER = drizzleSql`
  ${creatorProfiles.settings}->'unclaimedArtistProfile'->>'state' = 'unclaimed'
`;

/**
 * Backfill existing unclaimed structured-credit profiles that predate the
 * identity-enrichment stage (JOV-6529). Idempotent: profiles re-checked
 * simply rewrite a deterministic receipt.
 */
export async function backfillUnclaimedArtistIdentities(options?: {
  readonly limit?: number;
  readonly cursor?: string | null;
}): Promise<UnclaimedEnrichmentBackfillSummary> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 100);

  const profiles = await db
    .select(ENRICHABLE_PROFILE_SELECT)
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isClaimed, false),
        isNotNull(creatorProfiles.spotifyId),
        UNCLAIMED_MARKER_FILTER,
        ...(options?.cursor ? [gt(creatorProfiles.id, options.cursor)] : [])
      )
    )
    .orderBy(asc(creatorProfiles.id))
    .limit(limit);

  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    if (!profile.spotifyId) {
      skipped += 1;
      continue;
    }
    try {
      const receipt = await enrichExistingUnclaimedArtistProfile(profile.id);
      if (receipt) enriched += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      logger.warn('Unclaimed artist enrichment backfill failed', {
        creatorProfileId: profile.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    scanned: profiles.length,
    enriched,
    skipped,
    failed,
    nextCursor:
      profiles.length === limit ? (profiles.at(-1)?.id ?? null) : null,
  };
}
