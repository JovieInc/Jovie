/**
 * Unclaimed-artist identity evidence evaluation. JOV-6529
 *
 * Exact provider-ID-backed artist profiles (the structured-credit
 * reconciliation path) previously published with a single Spotify social
 * link and no enrichment receipt. This module is the deterministic policy
 * layer for the bounded identity-enrichment stage that runs before an
 * unclaimed profile is treated as share-ready:
 *
 *   - every destination is an `IdentityObservation` carrying provenance
 *     (source), observed time, and the URL the source returned;
 *   - observations are only ever attached through exact provider/entity
 *     matches (e.g. a MusicFetch artist lookup resolved from the artist's
 *     own Spotify URL) — display-name similarity never creates or promotes
 *     a destination;
 *   - links are normalized and deduped by canonical platform identity;
 *   - disagreement between sources on a single-identity platform is
 *     surfaced as a conflict, not silently resolved;
 *   - the result feeds the share-readiness receipt stored on the profile,
 *     the set of publishable high-confidence destinations, and handle
 *     evidence for the friendly-handle composer.
 *
 * Pure and deterministic: no I/O, no `server-only`, safe for unit tests
 * and for use inside the reconciliation transaction.
 */

import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';

// ============================================================================
// Types
// ============================================================================

/**
 * Lifecycle states for the unclaimed-identity enrichment pass. These are the
 * same four states Ovie surfaces in the creator drawer's Social pane.
 */
export type UnclaimedIdentityStatus =
  /** Enrichment has not run for this profile (or could not run). */
  | 'not_checked'
  /** Enrichment ran and found no artist-controlled destinations. */
  | 'not_found'
  /** ≥1 artist-controlled destination verified, no unresolved conflicts. */
  | 'verified'
  /** Sources disagree on at least one platform and the tie could not be
   *  resolved by corroboration. */
  | 'conflicted';

/** Settings key holding the enrichment receipt on creator_profiles.settings. */
export const UNCLAIMED_IDENTITY_ENRICHMENT_KEY =
  'unclaimedArtistIdentityEnrichment' as const;

/** One source's claim that the artist controls a destination URL. */
export interface IdentityObservation {
  /** Provenance: which trusted source produced this observation. */
  readonly source: string;
  readonly url: string;
  /** Platform-side entity ID when the source provides one. */
  readonly externalId?: string | null;
  /** ISO timestamp of when the source was read. */
  readonly observedAt: string;
}

export interface EvaluatedIdentityLink {
  /** Detection platform id (e.g. 'instagram', 'spotify', 'website'). */
  readonly platform: string;
  /** Normalized URL that survived dedupe. */
  readonly url: string;
  readonly status: 'verified' | 'conflicted';
  readonly confidence: number;
  /** Every source that observed this exact canonical identity. */
  readonly sources: string[];
  readonly observedAt: string;
}

export interface IdentityPlatformConflict {
  readonly platform: string;
  /** All distinct contested canonical URLs for the platform. */
  readonly urls: string[];
  /** The corroboration winner when one exists, else null (unresolved). */
  readonly resolvedUrl: string | null;
}

export interface UnclaimedArtistIdentityEvaluation {
  readonly status: Exclude<UnclaimedIdentityStatus, 'not_checked'>;
  readonly links: EvaluatedIdentityLink[];
  /**
   * Social handles from verified, artist-controlled links. Consumed by the
   * friendly-handle composer as `provider_identity_handle` candidates;
   * never authoritative on their own.
   */
  readonly handleEvidence: string[];
  readonly conflicts: IdentityPlatformConflict[];
}

/** Persisted share-readiness receipt written to profile settings. */
export interface UnclaimedIdentityEnrichmentReceipt {
  readonly status: UnclaimedIdentityStatus;
  readonly observedAt: string;
  readonly sources: string[];
  /** Exact provider entity the enrichment was anchored to. */
  readonly provider: 'spotify';
  readonly providerArtistId: string | null;
  readonly verifiedPlatforms: string[];
  readonly conflicts: IdentityPlatformConflict[];
  readonly linksFound: number;
  /**
   * Minimum evidence contract for treating the profile as share-ready:
   * verified status with at least one artist-controlled destination beyond
   * the source provider link itself.
   */
  readonly shareReady: boolean;
}

// ============================================================================
// Classification helpers
// ============================================================================

/**
 * Tokens that mark a social handle or site label as not artist-controlled:
 * fan pages, fan clubs, label/tribute accounts. Matching is deliberately
 * narrow (substring on the normalized handle) so legitimate handles like
 * `fantasia` are not filtered — only unambiguous fan/label markers are.
 */
const NON_ARTIST_MARKER_PATTERN =
  /(fanpage|fan_page|fanclub|fan_club|fans|unofficial|tribute)/;

function isArtistControlledHandle(handle: string | null): boolean {
  if (!handle) return true;
  return !NON_ARTIST_MARKER_PATTERN.test(handle);
}

interface ClassifiedObservation {
  readonly platformId: string;
  readonly category: string;
  readonly canonical: string;
  readonly handle: string | null;
  readonly normalizedUrl: string;
}

/** Platforms where multiple distinct identities are legitimate (an artist
 * can run several official domains); every other platform is single-identity
 * and disagreement is a conflict. */
const MULTI_IDENTITY_PLATFORMS = new Set(['website']);

function classifyObservationUrl(url: string): ClassifiedObservation | null {
  let detected: ReturnType<typeof detectPlatform>;
  try {
    detected = detectPlatform(url);
  } catch {
    return null;
  }

  if (detected.isValid) {
    const canonical = canonicalIdentity(detected);
    let handle: string | null = null;
    try {
      const parsed = new URL(detected.normalizedUrl);
      const first = parsed.pathname.split('/').find(Boolean);
      if (detected.platform.category === 'social' && first) {
        handle = first.replace(/^@/, '').toLowerCase();
      }
    } catch {
      handle = null;
    }
    return {
      platformId: detected.platform.id,
      category: detected.platform.category,
      canonical,
      handle,
      normalizedUrl: detected.normalizedUrl,
    };
  }

  // Unrecognized host: the detector's 'website' fallback. An official artist
  // domain is still valid identity evidence even though social_links cannot
  // render it, so it is classified instead of dropped.
  if (detected.platform.id === 'website') {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (!host) return null;
      return {
        platformId: 'website',
        category: 'websites',
        canonical: `website:${host}`,
        handle: host.split('.')[0] ?? null,
        normalizedUrl: url,
      };
    } catch {
      return null;
    }
  }

  return null;
}

// ============================================================================
// Evaluation
// ============================================================================

interface CanonicalBucket {
  readonly canonical: string;
  readonly platformId: string;
  readonly category: string;
  readonly normalizedUrl: string;
  readonly handle: string | null;
  readonly sources: Set<string>;
  observedAt: string;
}

function confidenceForSources(sourceCount: number): number {
  // Single-source entity-matched evidence starts at 0.7; corroboration by
  // additional independent sources raises it toward the 0.95 cap.
  return Math.min(0.95, 0.7 + 0.15 * (sourceCount - 1));
}

/**
 * Evaluate identity observations into verified/conflicted destinations.
 *
 * Deterministic rules:
 *  - URLs that fail detection and are not plain websites are dropped;
 *  - handles carrying fan/label markers are dropped (never artist-controlled);
 *  - observations dedupe on canonical platform identity;
 *  - single-identity platforms with disagreeing canonicals resolve to the
 *    candidate corroborated by the most distinct sources; a tie stays
 *    unresolved and marks the evaluation conflicted;
 *  - `website` is multi-identity: several official domains are all verified.
 */
export function evaluateUnclaimedArtistIdentity(
  observations: readonly IdentityObservation[]
): UnclaimedArtistIdentityEvaluation {
  const byPlatform = new Map<string, Map<string, CanonicalBucket>>();

  for (const observation of observations) {
    if (!observation.url || !observation.observedAt) continue;
    const classified = classifyObservationUrl(observation.url);
    if (!classified) continue;
    if (!isArtistControlledHandle(classified.handle)) continue;

    let buckets = byPlatform.get(classified.platformId);
    if (!buckets) {
      buckets = new Map();
      byPlatform.set(classified.platformId, buckets);
    }

    const existing = buckets.get(classified.canonical);
    if (existing) {
      existing.sources.add(observation.source);
      if (observation.observedAt > existing.observedAt) {
        existing.observedAt = observation.observedAt;
      }
    } else {
      buckets.set(classified.canonical, {
        canonical: classified.canonical,
        platformId: classified.platformId,
        category: classified.category,
        normalizedUrl: classified.normalizedUrl,
        handle: classified.handle,
        sources: new Set([observation.source]),
        observedAt: observation.observedAt,
      });
    }
  }

  const links: EvaluatedIdentityLink[] = [];
  const conflicts: IdentityPlatformConflict[] = [];
  const handleEvidence: string[] = [];

  for (const [platformId, buckets] of byPlatform) {
    const candidates = [...buckets.values()];

    if (candidates.length === 1 || MULTI_IDENTITY_PLATFORMS.has(platformId)) {
      for (const bucket of candidates) {
        links.push({
          platform: platformId,
          url: bucket.normalizedUrl,
          status: 'verified',
          confidence: confidenceForSources(bucket.sources.size),
          sources: [...bucket.sources].sort(),
          observedAt: bucket.observedAt,
        });
        if (bucket.category === 'social' && bucket.handle) {
          handleEvidence.push(bucket.handle);
        }
      }
      continue;
    }

    // Single-identity platform disagreement: corroboration decides, ties
    // stay unresolved so a stale or fan-adjacent handle never wins silently.
    const maxSources = Math.max(...candidates.map(c => c.sources.size));
    const winners = candidates.filter(c => c.sources.size === maxSources);
    const winner = winners.length === 1 ? winners[0] : null;

    conflicts.push({
      platform: platformId,
      urls: candidates.map(c => c.normalizedUrl).sort(),
      resolvedUrl: winner?.normalizedUrl ?? null,
    });

    for (const bucket of candidates) {
      const resolved = winner === bucket;
      links.push({
        platform: platformId,
        url: bucket.normalizedUrl,
        status: resolved ? 'verified' : 'conflicted',
        confidence: resolved
          ? confidenceForSources(bucket.sources.size)
          : Math.min(0.4, confidenceForSources(bucket.sources.size) - 0.3),
        sources: [...bucket.sources].sort(),
        observedAt: bucket.observedAt,
      });
      if (resolved && bucket.category === 'social' && bucket.handle) {
        handleEvidence.push(bucket.handle);
      }
    }
  }

  const unresolved = conflicts.some(conflict => conflict.resolvedUrl === null);
  const verifiedCount = links.filter(link => link.status === 'verified').length;

  const status: UnclaimedArtistIdentityEvaluation['status'] =
    verifiedCount === 0
      ? conflicts.length > 0
        ? 'conflicted'
        : 'not_found'
      : unresolved
        ? 'conflicted'
        : 'verified';

  return { status, links, handleEvidence, conflicts };
}

// ============================================================================
// Source adapters
// ============================================================================

interface MusicFetchServiceLike {
  readonly link?: string;
  readonly url?: string;
  readonly id?: string;
}

interface MusicFetchArtistLike {
  readonly services?: Record<string, MusicFetchServiceLike | undefined>;
}

/**
 * Project a MusicFetch artist lookup into identity observations. The lookup
 * is resolved from the artist's exact Spotify URL, so every returned service
 * is entity-matched evidence — never name-inferred.
 */
export function observationsFromMusicFetchArtist(
  artistData: MusicFetchArtistLike,
  spotifyUrl: string,
  observedAt: string
): IdentityObservation[] {
  const observations: IdentityObservation[] = [
    {
      source: 'structured_spotify_release_credit',
      url: spotifyUrl,
      observedAt,
    },
  ];

  const seenCanonical = new Set<string>();
  for (const service of Object.values(artistData.services ?? {})) {
    const url = service?.link ?? service?.url;
    if (!url || seenCanonical.has(url)) continue;
    seenCanonical.add(url);
    observations.push({
      source: 'musicfetch',
      url,
      externalId: service?.id ?? null,
      observedAt,
    });
  }

  return observations;
}

// ============================================================================
// Receipt (settings JSONB)
// ============================================================================

export function buildUnclaimedIdentityEnrichmentReceipt(
  evaluation: UnclaimedArtistIdentityEvaluation,
  params: { providerArtistId: string | null; observedAt: string }
): UnclaimedIdentityEnrichmentReceipt {
  const verified = evaluation.links.filter(link => link.status === 'verified');
  return {
    status: evaluation.status,
    observedAt: params.observedAt,
    sources: [
      ...new Set(evaluation.links.flatMap(link => link.sources)),
    ].sort(),
    provider: 'spotify',
    providerArtistId: params.providerArtistId,
    verifiedPlatforms: verified.map(link => link.platform),
    conflicts: evaluation.conflicts,
    linksFound: evaluation.links.length,
    // Minimum evidence contract: verified evaluation plus at least one
    // artist-controlled destination beyond the source Spotify link.
    shareReady:
      evaluation.status === 'verified' &&
      verified.some(link => link.platform !== 'spotify'),
  };
}

/** Receipt written at profile creation before the enrichment pass runs. */
export function buildNotCheckedIdentityReceipt(params: {
  providerArtistId: string | null;
  observedAt: string;
}): UnclaimedIdentityEnrichmentReceipt {
  return {
    status: 'not_checked',
    observedAt: params.observedAt,
    sources: [],
    provider: 'spotify',
    providerArtistId: params.providerArtistId,
    verifiedPlatforms: [],
    conflicts: [],
    linksFound: 0,
    shareReady: false,
  };
}

const RECEIPT_STATUSES = new Set<UnclaimedIdentityStatus>([
  'not_checked',
  'not_found',
  'verified',
  'conflicted',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

/** Read and validate the enrichment receipt from profile settings. */
export function readUnclaimedIdentityEnrichment(
  settings: unknown
): UnclaimedIdentityEnrichmentReceipt | null {
  const receipt = asRecord(
    asRecord(settings)?.[UNCLAIMED_IDENTITY_ENRICHMENT_KEY]
  );
  if (
    !receipt ||
    typeof receipt.status !== 'string' ||
    !RECEIPT_STATUSES.has(receipt.status as UnclaimedIdentityStatus) ||
    typeof receipt.observedAt !== 'string' ||
    typeof receipt.shareReady !== 'boolean'
  ) {
    return null;
  }
  return receipt as unknown as UnclaimedIdentityEnrichmentReceipt;
}

/** Ovie-facing enrichment state; absent receipt means never checked. */
export function getUnclaimedIdentityStatus(
  settings: unknown
): UnclaimedIdentityStatus {
  return readUnclaimedIdentityEnrichment(settings)?.status ?? 'not_checked';
}

/**
 * Minimum evidence contract for presenting an unclaimed structured-credit
 * profile as share-ready. Profiles without it stay reachable via the stable
 * `/artists/:artistId` route but must not be promoted as finished profiles.
 */
export function isUnclaimedProfileShareReady(settings: unknown): boolean {
  return readUnclaimedIdentityEnrichment(settings)?.shareReady === true;
}
