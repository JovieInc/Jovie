const STRUCTURED_CREDIT_SOURCE = 'structured_spotify_release_credit' as const;

// verified = corroborated by >=2 independent sources; unverified = single
// trusted source bound to the exact provider ID; conflicted = sources
// disagree; not_found = checked and nothing found.
export type UnclaimedArtistFieldState =
  | 'verified'
  | 'unverified'
  | 'conflicted'
  | 'not_found';

// `not_checked` = the pass never ran (outage/budget/legacy); distinct from
// `not_found` = the pass ran and found nothing.
export type UnclaimedArtistEnrichmentStatus =
  | 'not_checked'
  | 'not_found'
  | 'verified'
  | 'conflicted';

export interface UnclaimedArtistEnrichmentReceipt {
  readonly status: UnclaimedArtistEnrichmentStatus;
  readonly checkedAt: string;

  readonly sources: readonly string[];
  /** Per-platform field state. */
  readonly fields: Record<string, UnclaimedArtistFieldState>;

  readonly conflicts: readonly string[];

  readonly musicbrainzId?: string | null;
  // Minimum evidence contract: false stays reachable via /artists/:artistId
  // but is not promoted as a finished profile.
  readonly shareReady: boolean;
}

export interface StructuredCreditProfileMarker {
  readonly artistRegistryId: string;
  readonly claimedAt?: string;
  readonly consentObtained: boolean;
  readonly enrichment?: UnclaimedArtistEnrichmentReceipt;
  readonly ownershipVerified: boolean;
  readonly provider: 'spotify';
  readonly providerArtistId: string;
  readonly representationVerified: boolean;
  readonly source: typeof STRUCTURED_CREDIT_SOURCE;
  readonly state: 'unclaimed' | 'claimed';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function buildStructuredCreditProfileMarker(params: {
  readonly artistRegistryId: string;
  readonly providerArtistId: string;
}): StructuredCreditProfileMarker {
  return {
    state: 'unclaimed',
    source: STRUCTURED_CREDIT_SOURCE,
    artistRegistryId: params.artistRegistryId,
    provider: 'spotify',
    providerArtistId: params.providerArtistId,
    ownershipVerified: false,
    representationVerified: false,
    consentObtained: false,
  };
}

export function readStructuredCreditProfileMarker(
  settings: unknown
): StructuredCreditProfileMarker | null {
  const marker = asRecord(asRecord(settings)?.unclaimedArtistProfile);
  if (
    marker?.source !== STRUCTURED_CREDIT_SOURCE ||
    marker.provider !== 'spotify' ||
    (marker.state !== 'unclaimed' && marker.state !== 'claimed') ||
    typeof marker.artistRegistryId !== 'string' ||
    typeof marker.providerArtistId !== 'string' ||
    typeof marker.ownershipVerified !== 'boolean' ||
    typeof marker.representationVerified !== 'boolean' ||
    typeof marker.consentObtained !== 'boolean'
  ) {
    return null;
  }

  return marker as unknown as StructuredCreditProfileMarker;
}

export function isUnclaimedStructuredCreditProfile(settings: unknown): boolean {
  const marker = readStructuredCreditProfileMarker(settings);
  return (
    marker?.state === 'unclaimed' &&
    marker.ownershipVerified === false &&
    marker.representationVerified === false &&
    marker.consentObtained === false
  );
}

// Record a receipt without touching claim/ownership fields; returns the
// original settings for claimed or foreign markers (never overwritten).
export function recordUnclaimedArtistEnrichment(
  settings: Record<string, unknown>,
  receipt: UnclaimedArtistEnrichmentReceipt
): Record<string, unknown> {
  const marker = readStructuredCreditProfileMarker(settings);
  if (marker?.state !== 'unclaimed') return settings;

  return {
    ...settings,
    unclaimedArtistProfile: {
      ...marker,
      enrichment: receipt,
    },
  };
}

// Defaults to `not_checked` for markers predating the pass.
export function getUnclaimedArtistEnrichmentStatus(
  settings: unknown
): UnclaimedArtistEnrichmentStatus {
  const marker = readStructuredCreditProfileMarker(settings);
  return marker?.enrichment?.status ?? 'not_checked';
}

export function readUnclaimedArtistEnrichmentReceipt(
  settings: unknown
): UnclaimedArtistEnrichmentReceipt | null {
  return readStructuredCreditProfileMarker(settings)?.enrichment ?? null;
}

export function isUnclaimedProfileShareReady(settings: unknown): boolean {
  return (
    readStructuredCreditProfileMarker(settings)?.enrichment?.shareReady === true
  );
}

export function markStructuredCreditProfileClaimed(
  settings: Record<string, unknown>,
  claimedAt: Date
): Record<string, unknown> {
  const marker = readStructuredCreditProfileMarker(settings);
  if (marker?.state !== 'unclaimed') return settings;

  return {
    ...settings,
    unclaimedArtistProfile: {
      ...marker,
      state: 'claimed',
      ownershipVerified: true,
      consentObtained: true,
      claimedAt: claimedAt.toISOString(),
    },
  };
}
