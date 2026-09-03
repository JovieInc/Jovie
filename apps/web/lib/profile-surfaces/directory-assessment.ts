import type { MusicBrainzArtist } from '@/lib/dsp-enrichment/types';

export const MUSICBRAINZ_EVIDENCE_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

const MUSICBRAINZ_HOST = 'musicbrainz.org';
const MIN_VERIFIED_IDENTITY_CONFIDENCE = 0.9;
const EXPECTED_IMPACT =
  'Protect the creator authority identity used by Presence.';
const MUSICBRAINZ_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMusicBrainzIdentifier(value: unknown): value is string {
  return typeof value === 'string' && MUSICBRAINZ_ID_PATTERN.test(value);
}

export function normalizeMusicBrainzIdentifier(value: unknown): string | null {
  return isMusicBrainzIdentifier(value) ? value.toLowerCase() : null;
}

export type MusicBrainzDirectoryOutcome =
  | 'current'
  | 'identity_mismatch'
  | 'identity_unverified'
  | 'invalid_provenance'
  | 'listing_missing'
  | 'stale_evidence'
  | 'surface_identity_mismatch';

export type MusicBrainzDirectoryNextActionKind =
  | 'confirm_identity_evidence'
  | 'monitor_until_refresh_due'
  | 'prepare_missing_entity_evidence'
  | 'quarantine_identity_match'
  | 'refetch_official_evidence'
  | 'refresh_read_only_evidence';

export interface MusicBrainzDirectorySurface {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly platform: 'musicbrainz';
  readonly kind: 'authority';
  readonly qualificationStatus: string;
  readonly identityConfidence: string | null;
  readonly externalId: string;
  readonly normalizedUrl: string;
}

export interface MusicBrainzDirectoryObservation {
  readonly source: string;
  readonly requestUrl: string;
  readonly fetchedAt: Date;
  readonly entity: MusicBrainzArtist | null;
}

export interface MusicBrainzDirectoryAssessment {
  readonly schemaVersion: 1;
  readonly registryEntity: 'musicbrainz_artist';
  readonly creatorProfileId: string;
  readonly surfaceId: string;
  readonly primaryUrl: string;
  readonly idempotencyKey: string;
  readonly outcome: MusicBrainzDirectoryOutcome;
  readonly confidence: number;
  readonly owner: 'creator' | 'jovie';
  readonly expectedImpact: string;
  readonly freshness: {
    readonly observedAt: string;
    readonly staleAt: string;
    readonly status: 'fresh' | 'stale';
  };
  readonly evidence: {
    readonly source: string;
    readonly requestUrl: string;
    readonly provenanceStatus: 'verified' | 'invalid';
    readonly expectedEntityId: string;
    readonly observedEntityId: string | null;
    readonly observedName: string | null;
    readonly observedType: string | null;
    readonly observedCountry: string | null;
  };
  readonly nextAction: {
    readonly kind: MusicBrainzDirectoryNextActionKind;
    readonly description: string;
    readonly accountCreationAllowed: false;
    readonly externalSubmissionAllowed: false;
  };
}

export interface AssessMusicBrainzDirectoryObservationInput {
  readonly surface: MusicBrainzDirectorySurface;
  readonly observation: MusicBrainzDirectoryObservation;
  readonly now?: Date;
}

interface OutcomeDecision {
  readonly outcome: MusicBrainzDirectoryOutcome;
  readonly confidence: number;
  readonly owner: 'creator' | 'jovie';
  readonly nextAction: Pick<
    MusicBrainzDirectoryAssessment['nextAction'],
    'kind' | 'description'
  >;
}

function readIdentityConfidence(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function isExpectedSurfaceUrl(surface: MusicBrainzDirectorySurface): boolean {
  try {
    const url = new URL(surface.normalizedUrl);
    const pathMatch = /^\/artist\/([^/]+)\/?$/.exec(url.pathname);
    const expectedId = normalizeMusicBrainzIdentifier(surface.externalId);
    const pathId = normalizeMusicBrainzIdentifier(pathMatch?.[1]);
    return (
      expectedId !== null &&
      pathId === expectedId &&
      url.protocol === 'https:' &&
      url.hostname === MUSICBRAINZ_HOST &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function hasVerifiedProvenance(
  surface: MusicBrainzDirectorySurface,
  observation: MusicBrainzDirectoryObservation
): boolean {
  if (observation.source !== 'musicbrainz_api') return false;

  try {
    const url = new URL(observation.requestUrl);
    const pathMatch = /^\/ws\/2\/artist\/([^/]+)$/.exec(url.pathname);
    const expectedId = normalizeMusicBrainzIdentifier(surface.externalId);
    const pathId = normalizeMusicBrainzIdentifier(pathMatch?.[1]);
    return (
      expectedId !== null &&
      pathId === expectedId &&
      url.protocol === 'https:' &&
      url.hostname === MUSICBRAINZ_HOST &&
      url.searchParams.get('fmt') === 'json' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

function hasSafeEntityPayload(entity: MusicBrainzArtist | null): boolean {
  if (entity === null) return true;
  const boundedString = (value: unknown, maxLength: number) =>
    typeof value === 'string' && value.length > 0 && value.length <= maxLength;
  const optionalString = (value: unknown, maxLength: number) =>
    value == null || boundedString(value, maxLength);

  return (
    isMusicBrainzIdentifier(entity.id) &&
    boundedString(entity.name, 512) &&
    optionalString(entity.type, 64) &&
    optionalString(entity.country, 64)
  );
}

function decideOutcome(input: {
  readonly surface: MusicBrainzDirectorySurface;
  readonly observation: MusicBrainzDirectoryObservation;
  readonly provenanceVerified: boolean;
  readonly stale: boolean;
  readonly identityConfidence: number;
}): OutcomeDecision {
  const { surface, observation } = input;

  if (!isExpectedSurfaceUrl(surface)) {
    return {
      outcome: 'surface_identity_mismatch',
      confidence: 1,
      owner: 'jovie',
      nextAction: {
        kind: 'quarantine_identity_match',
        description:
          'Quarantine the surface until its canonical URL and MBID agree.',
      },
    };
  }

  if (!input.provenanceVerified) {
    return {
      outcome: 'invalid_provenance',
      confidence: 0,
      owner: 'jovie',
      nextAction: {
        kind: 'refetch_official_evidence',
        description: 'Refetch this entity from the official read-only API.',
      },
    };
  }

  if (input.stale) {
    return {
      outcome: 'stale_evidence',
      confidence: input.identityConfidence * 0.5,
      owner: 'jovie',
      nextAction: {
        kind: 'refresh_read_only_evidence',
        description: 'Refresh the official read-only entity evidence.',
      },
    };
  }

  if (!observation.entity) {
    return {
      outcome: 'listing_missing',
      confidence: 1,
      owner: 'creator',
      nextAction: {
        kind: 'prepare_missing_entity_evidence',
        description:
          'Prepare identity evidence for creator review without submitting it.',
      },
    };
  }

  if (
    normalizeMusicBrainzIdentifier(observation.entity.id) !==
    normalizeMusicBrainzIdentifier(surface.externalId)
  ) {
    return {
      outcome: 'identity_mismatch',
      confidence: 1,
      owner: 'creator',
      nextAction: {
        kind: 'quarantine_identity_match',
        description:
          'Quarantine this match and collect evidence for creator review.',
      },
    };
  }

  if (
    surface.qualificationStatus !== 'qualified' ||
    input.identityConfidence < MIN_VERIFIED_IDENTITY_CONFIDENCE
  ) {
    return {
      outcome: 'identity_unverified',
      confidence: input.identityConfidence,
      owner: 'creator',
      nextAction: {
        kind: 'confirm_identity_evidence',
        description:
          'Confirm that this MusicBrainz entity belongs to the creator.',
      },
    };
  }

  return {
    outcome: 'current',
    confidence: input.identityConfidence,
    owner: 'creator',
    nextAction: {
      kind: 'monitor_until_refresh_due',
      description: 'Keep the entity read-only until its next evidence refresh.',
    },
  };
}

/**
 * Assess one canonical MusicBrainz artist surface from supplied read-only
 * evidence. This function never creates an account or submits an external edit.
 */
export function assessMusicBrainzDirectoryObservation(
  input: AssessMusicBrainzDirectoryObservationInput
): MusicBrainzDirectoryAssessment {
  const now = input.now ?? new Date();
  const staleAt = new Date(
    input.observation.fetchedAt.getTime() + MUSICBRAINZ_EVIDENCE_FRESHNESS_MS
  );
  const stale = now.getTime() > staleAt.getTime();
  const safeEntityPayload = hasSafeEntityPayload(input.observation.entity);
  const expectedEntityId =
    normalizeMusicBrainzIdentifier(input.surface.externalId) ??
    input.surface.externalId;
  const provenanceVerified =
    safeEntityPayload &&
    hasVerifiedProvenance(input.surface, input.observation);
  const identityConfidence = readIdentityConfidence(
    input.surface.identityConfidence
  );
  const decision = decideOutcome({
    surface: input.surface,
    observation: input.observation,
    provenanceVerified,
    stale,
    identityConfidence,
  });

  return {
    schemaVersion: 1,
    registryEntity: 'musicbrainz_artist',
    creatorProfileId: input.surface.creatorProfileId,
    surfaceId: input.surface.id,
    primaryUrl: input.surface.normalizedUrl,
    idempotencyKey: `presence:directory:musicbrainz:${input.surface.id}`,
    outcome: decision.outcome,
    confidence: decision.confidence,
    owner: decision.owner,
    expectedImpact: EXPECTED_IMPACT,
    freshness: {
      observedAt: input.observation.fetchedAt.toISOString(),
      staleAt: staleAt.toISOString(),
      status: stale ? 'stale' : 'fresh',
    },
    evidence: {
      source: input.observation.source,
      requestUrl: input.observation.requestUrl,
      provenanceStatus: provenanceVerified ? 'verified' : 'invalid',
      expectedEntityId,
      observedEntityId: safeEntityPayload
        ? normalizeMusicBrainzIdentifier(input.observation.entity?.id)
        : null,
      observedName: safeEntityPayload
        ? (input.observation.entity?.name ?? null)
        : null,
      observedType: safeEntityPayload
        ? (input.observation.entity?.type ?? null)
        : null,
      observedCountry: safeEntityPayload
        ? (input.observation.entity?.country ?? null)
        : null,
    },
    nextAction: {
      ...decision.nextAction,
      accountCreationAllowed: false,
      externalSubmissionAllowed: false,
    },
  };
}
