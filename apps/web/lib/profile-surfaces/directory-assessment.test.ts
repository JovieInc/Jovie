import { describe, expect, it } from 'vitest';
import {
  assessMusicBrainzDirectoryObservation,
  MUSICBRAINZ_EVIDENCE_FRESHNESS_MS,
} from './directory-assessment';

const CREATOR_PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const SURFACE_ID = '22222222-2222-4222-8222-222222222222';
const EXPECTED_MBID = '33333333-3333-4333-8333-333333333333';
const OTHER_MBID = '44444444-4444-4444-8444-444444444444';
const FETCHED_AT = new Date('2026-08-30T12:00:00.000Z');
type AssessmentInput = Parameters<
  typeof assessMusicBrainzDirectoryObservation
>[0];

function input(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    surface: {
      id: SURFACE_ID,
      creatorProfileId: CREATOR_PROFILE_ID,
      platform: 'musicbrainz' as const,
      kind: 'authority' as const,
      qualificationStatus: 'qualified',
      identityConfidence: '0.95',
      externalId: EXPECTED_MBID,
      normalizedUrl: `https://musicbrainz.org/artist/${EXPECTED_MBID}`,
    },
    observation: {
      source: 'musicbrainz_api' as const,
      requestUrl: `https://musicbrainz.org/ws/2/artist/${EXPECTED_MBID}?inc=aliases+tags+genres+url-rels&fmt=json`,
      fetchedAt: FETCHED_AT,
      entity: {
        id: EXPECTED_MBID,
        name: 'Example Artist',
        type: 'Person',
        country: 'US',
      },
    },
    now: new Date('2026-08-30T12:05:00.000Z'),
    ...overrides,
  };
}

describe('MusicBrainz directory assessment safeguards', () => {
  it('quarantines a wrong entity instead of treating it as the creator', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: {
          ...input().observation,
          entity: {
            ...input().observation.entity!,
            id: OTHER_MBID,
            name: 'Different Person',
          },
        },
      })
    );

    expect(assessment.outcome).toBe('identity_mismatch');
    expect(assessment.confidence).toBe(1);
    expect(assessment.nextAction.kind).toBe('quarantine_identity_match');
    expect(assessment.nextAction.externalSubmissionAllowed).toBe(false);
  });

  it('rejects evidence that did not come from the exact official API entity', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: {
          ...input().observation,
          requestUrl: `https://example.com/ws/2/artist/${EXPECTED_MBID}?fmt=json`,
        },
      })
    );

    expect(assessment.outcome).toBe('invalid_provenance');
    expect(assessment.confidence).toBe(0);
    expect(assessment.nextAction.kind).toBe('refetch_official_evidence');
    expect(assessment.evidence.provenanceStatus).toBe('invalid');
  });

  it('refuses to act on stale evidence', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        now: new Date(
          FETCHED_AT.getTime() + MUSICBRAINZ_EVIDENCE_FRESHNESS_MS + 1
        ),
      })
    );

    expect(assessment.outcome).toBe('stale_evidence');
    expect(assessment.freshness.status).toBe('stale');
    expect(assessment.nextAction.kind).toBe('refresh_read_only_evidence');
    expect(assessment.nextAction.accountCreationAllowed).toBe(false);
    expect(assessment.nextAction.externalSubmissionAllowed).toBe(false);
  });

  it.each([
    `https://musicbrainz.org/artist/${OTHER_MBID}`,
    'not-a-url',
  ])('quarantines a canonical surface with an invalid identity URL: %s', url => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        surface: { ...input().surface, normalizedUrl: url },
      })
    );

    expect(assessment.outcome).toBe('surface_identity_mismatch');
    expect(assessment.owner).toBe('jovie');
    expect(assessment.nextAction.kind).toBe('quarantine_identity_match');
  });

  it('prepares evidence without submitting when the entity is missing', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: { ...input().observation, entity: null },
      })
    );

    expect(assessment.outcome).toBe('listing_missing');
    expect(assessment.nextAction).toMatchObject({
      kind: 'prepare_missing_entity_evidence',
      accountCreationAllowed: false,
      externalSubmissionAllowed: false,
    });
  });

  it.each([
    { qualificationStatus: 'suggested', identityConfidence: '0.70' },
    { qualificationStatus: 'qualified', identityConfidence: 'not-a-number' },
  ])('requires identity confirmation for weak canonical evidence: %o', ({
    qualificationStatus,
    identityConfidence,
  }) => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        surface: {
          ...input().surface,
          qualificationStatus,
          identityConfidence,
        },
      })
    );

    expect(assessment.outcome).toBe('identity_unverified');
    expect(assessment.nextAction.kind).toBe('confirm_identity_evidence');
  });

  it('treats malformed source URLs as invalid provenance', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: {
          ...input().observation,
          requestUrl: 'not-a-url',
        },
      })
    );

    expect(assessment.outcome).toBe('invalid_provenance');
  });

  it('does not persist malformed external entity fields as trusted evidence', () => {
    const malformedEntity = {
      id: EXPECTED_MBID,
      name: 42,
    } as unknown as NonNullable<
      ReturnType<typeof input>['observation']['entity']
    >;
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: {
          ...input().observation,
          entity: malformedEntity,
        },
      })
    );

    expect(assessment.outcome).toBe('invalid_provenance');
    expect(assessment.evidence.observedEntityId).toBeNull();
    expect(assessment.evidence.observedName).toBeNull();
  });

  it('rejects a malformed observed MBID as invalid provenance', () => {
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        observation: {
          ...input().observation,
          entity: { ...input().observation.entity!, id: 'not-an-mbid' },
        },
      })
    );

    expect(assessment.outcome).toBe('invalid_provenance');
    expect(assessment.evidence.observedEntityId).toBeNull();
  });

  it('keeps a fresh exact entity read-only and records accountability', () => {
    const assessment = assessMusicBrainzDirectoryObservation(input());

    expect(assessment).toMatchObject({
      outcome: 'current',
      confidence: 0.95,
      owner: 'creator',
      expectedImpact:
        'Protect the creator authority identity used by Presence.',
      evidence: {
        provenanceStatus: 'verified',
        expectedEntityId: EXPECTED_MBID,
        observedEntityId: EXPECTED_MBID,
      },
      nextAction: {
        kind: 'monitor_until_refresh_due',
        accountCreationAllowed: false,
        externalSubmissionAllowed: false,
      },
    });
  });

  it('normalizes uppercase canonical MBIDs before identity comparison', () => {
    const uppercaseMbid = EXPECTED_MBID.toUpperCase();
    const assessment = assessMusicBrainzDirectoryObservation(
      input({
        surface: {
          ...input().surface,
          externalId: uppercaseMbid,
          normalizedUrl: `https://musicbrainz.org/artist/${uppercaseMbid}`,
        },
        observation: {
          ...input().observation,
          requestUrl: `https://musicbrainz.org/ws/2/artist/${uppercaseMbid}?fmt=json`,
        },
      })
    );

    expect(assessment.outcome).toBe('current');
    expect(assessment.evidence).toMatchObject({
      expectedEntityId: EXPECTED_MBID,
      observedEntityId: EXPECTED_MBID,
    });
  });
});
