const STRUCTURED_CREDIT_SOURCE = 'structured_spotify_release_credit' as const;

/** Per-source evidence status for the JOV-6529 enrichment pass (Ovie-facing). */
export type IdentitySourceStatus = 'verified' | 'not_found' | 'not_checked';

export type IdentityEnrichmentSource = 'musicfetch' | 'musicbrainz';

/** Same platform, different canonical destinations from trusted sources. */
export interface IdentityEnrichmentConflict {
  readonly platform: string;
  readonly urls: readonly string[];
  readonly sources: readonly IdentityEnrichmentSource[];
}

export type UnclaimedEnrichmentStatus =
  | 'enriched'
  | 'partial'
  | 'conflicted'
  | 'not_found'
  | 'skipped';

/**
 * JOV-6529 enrichment receipt on the marker. `shareReady` is the minimum
 * evidence contract for treating an unclaimed profile as finished; below the
 * bar it stays reachable via `/artists/:artistId` but is not promoted.
 */
export interface UnclaimedIdentityEnrichmentReceipt {
  readonly status: UnclaimedEnrichmentStatus;
  readonly observedAt: string;
  readonly shareReady: boolean;
  readonly linkCount: number;
  readonly verifiedCount: number;
  readonly sources: Record<IdentityEnrichmentSource, IdentitySourceStatus>;
  readonly conflicts: readonly IdentityEnrichmentConflict[];
}

export interface StructuredCreditProfileMarker {
  readonly artistRegistryId: string;
  readonly claimedAt?: string;
  readonly consentObtained: boolean;
  readonly identityEnrichment?: UnclaimedIdentityEnrichmentReceipt;
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

/** Read the enrichment receipt off the marker; null means `not checked`. */
export function readUnclaimedIdentityEnrichment(
  settings: unknown
): UnclaimedIdentityEnrichmentReceipt | null {
  const receipt = asRecord(
    readStructuredCreditProfileMarker(settings)
  )?.identityEnrichment;
  const record = asRecord(receipt);
  if (
    !record ||
    typeof record.status !== 'string' ||
    typeof record.shareReady !== 'boolean' ||
    typeof record.observedAt !== 'string'
  ) {
    return null;
  }
  return record as unknown as UnclaimedIdentityEnrichmentReceipt;
}

/** Merge a receipt into the marker; claimed markers are never rewritten. */
export function withIdentityEnrichmentReceipt(
  settings: Record<string, unknown>,
  receipt: UnclaimedIdentityEnrichmentReceipt
): Record<string, unknown> {
  const marker = readStructuredCreditProfileMarker(settings);
  if (marker?.state !== 'unclaimed') return settings;

  return {
    ...settings,
    unclaimedArtistProfile: {
      ...marker,
      identityEnrichment: receipt,
    },
  };
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
