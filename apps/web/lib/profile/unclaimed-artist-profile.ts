const STRUCTURED_CREDIT_SOURCE = 'structured_spotify_release_credit' as const;

export interface StructuredCreditProfileMarker {
  readonly artistRegistryId: string;
  readonly claimedAt?: string;
  readonly consentObtained: boolean;
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
    !marker ||
    marker.source !== STRUCTURED_CREDIT_SOURCE ||
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

export function markStructuredCreditProfileClaimed(
  settings: Record<string, unknown>,
  claimedAt: Date
): Record<string, unknown> {
  const marker = readStructuredCreditProfileMarker(settings);
  if (!marker || marker.state !== 'unclaimed') return settings;

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
