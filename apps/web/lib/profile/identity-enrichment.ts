/**
 * Identity-enrichment receipt for provider-ID-backed unclaimed artist
 * profiles (JOV-6529).
 *
 * Structured-credit reconciliation previously published a public profile
 * holding only the Spotify identity row. This module records the bounded
 * enrichment pass that runs before the profile is treated as share-ready:
 * which trusted sources were checked, which artist-controlled destinations
 * were found, per-destination provenance/confidence, and unresolved
 * conflicts — so Ovie can distinguish `not_checked`, `not_found`,
 * `conflicted`, and `verified` instead of rendering a bare empty pane.
 *
 * Pure module: no DB, no network, safe to import from client bundles and
 * admin type mappers.
 */

export type IdentityEnrichmentStatus =
  /** The enrichment pass never ran (source unavailable or not yet attempted). */
  | 'not_checked'
  /** The pass ran and found no artist-controlled destination beyond the seed. */
  | 'not_found'
  /** Trusted sources disagree on at least one canonical destination. */
  | 'conflicted'
  /** At least one artist-controlled destination verified by exact provider match. */
  | 'verified';

export type EnrichedDestinationState =
  | 'active'
  | 'suggested'
  | 'rejected'
  | 'conflicted';

export interface EnrichedDestination {
  readonly platform: string;
  readonly url: string;
  readonly state: EnrichedDestinationState;
  /** Confidence 0-1 carried from the ingestion confidence model. */
  readonly confidence: number;
  /** Provenance: the trusted source that produced this destination. */
  readonly source: string;
  /** ISO timestamp of when the destination was observed. */
  readonly observedAt: string;
  /** How ownership was established — never display-name similarity. */
  readonly providerMatch: 'exact_provider_id';
}

export interface IdentityEnrichmentConflict {
  readonly platform: string;
  readonly urls: string[];
  readonly reason: 'source_disagreement' | 'existing_link_mismatch';
}

export interface IdentityEnrichmentReceipt {
  readonly version: 1;
  readonly status: IdentityEnrichmentStatus;
  readonly observedAt: string;
  readonly provider: 'spotify';
  readonly providerArtistId: string;
  /** Trusted sources actually queried during the pass. */
  readonly discoverySources: string[];
  readonly destinations: EnrichedDestination[];
  readonly conflicts: IdentityEnrichmentConflict[];
  /**
   * Minimum evidence contract for promoting an unclaimed profile as a
   * finished public profile: the pass verified and produced at least
   * `SHARE_READY_MIN_ACTIVE_DESTINATIONS` active artist-controlled
   * destinations with no unresolved conflicts. Profiles below the bar stay
   * reachable at their stable `/artists/:artistId` route but are not
   * promoted as finished.
   */
  readonly shareReady: boolean;
}

export const SHARE_READY_MIN_ACTIVE_DESTINATIONS = 2;

const SETTINGS_KEY = 'identityEnrichment';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

const STATUSES: ReadonlySet<string> = new Set([
  'not_checked',
  'not_found',
  'conflicted',
  'verified',
]);

/** Read the stored receipt, tolerating malformed/legacy settings payloads. */
export function readIdentityEnrichmentReceipt(
  settings: unknown
): IdentityEnrichmentReceipt | null {
  const receipt = asRecord(asRecord(settings)?.[SETTINGS_KEY]);
  if (
    !receipt ||
    receipt.version !== 1 ||
    typeof receipt.status !== 'string' ||
    !STATUSES.has(receipt.status) ||
    typeof receipt.providerArtistId !== 'string' ||
    typeof receipt.observedAt !== 'string' ||
    !Array.isArray(receipt.destinations) ||
    !Array.isArray(receipt.conflicts) ||
    !Array.isArray(receipt.discoverySources) ||
    typeof receipt.shareReady !== 'boolean'
  ) {
    return null;
  }
  return receipt as unknown as IdentityEnrichmentReceipt;
}

/** Attach (or replace) the receipt inside a profile settings object. */
export function withIdentityEnrichmentReceipt(
  settings: unknown,
  receipt: IdentityEnrichmentReceipt
): Record<string, unknown> {
  return {
    ...asRecord(settings),
    [SETTINGS_KEY]: receipt,
  };
}

/**
 * Derive the receipt fields that are pure functions of the destination set.
 * Callers supply destinations (already de-duplicated by canonical identity)
 * and explicit conflicts; status and share-readiness are computed here so
 * every writer agrees on the contract.
 */
export function buildIdentityEnrichmentReceipt(params: {
  readonly providerArtistId: string;
  readonly discoverySources: string[];
  readonly destinations: EnrichedDestination[];
  readonly conflicts: IdentityEnrichmentConflict[];
  /** The pass ran and consulted at least one trusted source. */
  readonly passExecuted: boolean;
  readonly observedAt?: string;
}): IdentityEnrichmentReceipt {
  const activeCount = params.destinations.filter(
    destination => destination.state === 'active'
  ).length;

  const status: IdentityEnrichmentStatus = !params.passExecuted
    ? 'not_checked'
    : params.conflicts.length > 0
      ? 'conflicted'
      : activeCount > 0
        ? 'verified'
        : 'not_found';

  return {
    version: 1,
    status,
    observedAt: params.observedAt ?? new Date().toISOString(),
    provider: 'spotify',
    providerArtistId: params.providerArtistId,
    discoverySources: [...params.discoverySources],
    destinations: params.destinations,
    conflicts: params.conflicts,
    shareReady:
      status === 'verified' &&
      activeCount >= SHARE_READY_MIN_ACTIVE_DESTINATIONS,
  };
}

/**
 * Minimum evidence contract for share-readiness. Unclaimed profiles whose
 * receipt is missing or below the bar remain reachable by their stable
 * `/artists/:artistId` route but must not be promoted as finished profiles.
 */
export function isUnclaimedProfileShareReady(settings: unknown): boolean {
  return readIdentityEnrichmentReceipt(settings)?.shareReady === true;
}
