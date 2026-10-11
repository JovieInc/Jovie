import { describe, expect, it } from 'vitest';
import {
  classifyToolRelationship,
  compareQualificationDecisions,
  type JobQualificationInput,
  migrateLegacyPaidTier,
  PUBLIC_EVIDENCE_EXTRACTION_VERSION,
  PUBLIC_SIGNAL_POLICY_REGISTRY,
  parseSpotifyArtistId,
  qualifySupportedJob,
} from '@/lib/leads/job-qualification';

const capturedAt = '2026-09-27T05:00:00.000Z';

function input(
  overrides: Partial<JobQualificationInput> = {}
): JobQualificationInput {
  return {
    candidateRunId: 'run-1',
    identity: {
      personId: 'person-1',
      displayName: 'Artist One',
      roles: ['artist'],
      representsIdentityIds: [],
      sourceAliases: ['linktree:artistone'],
      identityConfidence: 0.99,
      identityDecision: 'pass',
    },
    activeGoal: 'publish a claimable artist profile',
    supportedJobId: 'premade-artist-profile',
    observedOpportunity: 'public profile is incomplete',
    source: 'public-linktree',
    timeWindow: {
      startsAt: capturedAt,
      endsAt: '2026-10-04T05:00:00.000Z',
    },
    observations: [
      {
        id: 'obs-profile',
        kind: 'profile',
        observedFact: { incomplete: true },
        provenance: {
          sourceUrl: 'https://linktr.ee/artistone',
          sourceId: 'artistone',
          capturedAt,
          sourceDigest: `sha256:${'a'.repeat(64)}`,
          immutableRef: null,
          extractionVersion: PUBLIC_EVIDENCE_EXTRACTION_VERSION,
          supportingField: 'profile.links',
          supportingExcerpt: null,
        },
        confidence: 0.95,
        uncertainty: [],
        contradictions: [],
      },
    ],
    tools: [
      {
        toolId: 'linktree',
        usageObserved: 'yes',
        paidAccess: 'unknown',
        exactPlan: null,
        exactSpend: null,
        purchaseControl: 'unknown',
        replaceability: 'unknown',
        buyIntent: 'unknown',
        accessBasis: 'unknown',
        evidenceIds: ['obs-profile'],
      },
    ],
    spotifyUrls: ['https://open.spotify.com/artist/abc123'],
    channelEligibility: [
      {
        channel: 'instagram',
        decision: 'pass',
        permissionEvidenceIds: ['obs-profile'],
        reasons: [],
      },
      {
        channel: 'email',
        decision: 'review_needed',
        permissionEvidenceIds: [],
        reasons: ['permission_unknown'],
      },
    ],
    duplicateOf: [],
    existingCustomer: false,
    existingClaim: false,
    priorOutreach: false,
    now: capturedAt,
    evidenceMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('job qualification', () => {
  it('distinguishes Spotify artists from playlists, tracks, and fan links', () => {
    expect(parseSpotifyArtistId('https://open.spotify.com/artist/abc123')).toBe(
      'abc123'
    );
    expect(
      parseSpotifyArtistId('https://open.spotify.com/playlist/abc123')
    ).toBeNull();
    expect(
      parseSpotifyArtistId('https://open.spotify.com/track/abc123')
    ).toBeNull();
    expect(
      parseSpotifyArtistId('https://example.com/artist/abc123')
    ).toBeNull();
  });

  it('preserves tool usage separately from commercial facts', () => {
    const result = qualifySupportedJob(input());
    expect(result.tools[0]).toMatchObject({
      usageObserved: 'yes',
      paidAccess: 'unknown',
      exactPlan: null,
      exactSpend: null,
      purchaseControl: 'unknown',
      replaceability: 'unknown',
      buyIntent: 'unknown',
    });
    expect(result.evidenceDecision.state).toBe('pass');
    expect(result.commercialDecision).toMatchObject({
      state: 'review_needed',
      reasons: ['buy_intent_unknown', 'purchase_control_unknown'],
    });
  });

  it('allows a supported zero-audience, no-Spotify job', () => {
    const result = qualifySupportedJob(
      input({
        supportedJobId: 'youtube-thumbnail-preview',
        spotifyUrls: [],
        identity: { ...input().identity, roles: ['creator'] },
      })
    );
    expect(result.evidenceDecision.reasons).not.toContain(
      'spotify_artist_required'
    );
    expect(result.supportedJob.requiresAudienceMinimum).toBe(false);
  });

  it('abstains for playlists and same-name artist collisions', () => {
    const playlist = qualifySupportedJob(
      input({ spotifyUrls: ['https://open.spotify.com/playlist/abc123'] })
    );
    const collision = qualifySupportedJob(
      input({
        spotifyUrls: [
          'https://open.spotify.com/artist/abc123',
          'https://open.spotify.com/artist/def456',
        ],
      })
    );
    expect(playlist.evidenceDecision.reasons).toContain(
      'spotify_artist_required'
    );
    expect(collision.evidenceDecision.reasons).toContain(
      'spotify_identity_ambiguous'
    );
    expect(collision.spotifyArtistId).toBeNull();
  });

  it('routes represented identities to review without global disqualification', () => {
    const result = qualifySupportedJob(
      input({
        identity: {
          ...input().identity,
          roles: ['artist', 'manager'],
          representsIdentityIds: ['artist-2'],
        },
      })
    );
    expect(result.overallDecision.state).toBe('review_needed');
    expect(result.overallDecision.reasons).toContain(
      'represented_identity_human_path'
    );
  });

  it('keeps channel permissions separate for a multi-role identity', () => {
    const result = qualifySupportedJob(input());
    expect(result.contactDecisions).toEqual([
      expect.objectContaining({ channel: 'instagram', decision: 'pass' }),
      expect.objectContaining({
        channel: 'email',
        decision: 'review_needed',
      }),
    ]);
  });

  it('fails closed on duplicates while retaining rejected sample eligibility', () => {
    const result = qualifySupportedJob(
      input({ duplicateOf: ['customer-1'], priorOutreach: true })
    );
    expect(result.overallDecision.state).toBe('fail');
    expect(result.explorationSampleEligible).toBe(true);
    expect(result.observations).toHaveLength(1);
  });

  it('routes stale and contradictory evidence to review', () => {
    const base = input();
    const result = qualifySupportedJob({
      ...base,
      now: '2026-10-10T05:00:00.000Z',
      observations: [
        { ...base.observations[0]!, contradictions: ['different artist ID'] },
      ],
    });
    expect(result.evidenceDecision.reasons).toEqual(
      expect.arrayContaining(['stale_evidence', 'evidence_contradiction'])
    );
  });

  it('replays deterministically despite observation and role ordering', () => {
    const first = qualifySupportedJob(input());
    const second = qualifySupportedJob(
      input({
        identity: {
          ...input().identity,
          roles: [...input().identity.roles].reverse(),
          sourceAliases: [...input().identity.sourceAliases].reverse(),
        },
      })
    );
    expect(second.deterministicKey).toBe(first.deterministicKey);
  });

  it('migrates unsupported legacy paid booleans to unknown', () => {
    expect(
      migrateLegacyPaidTier({
        legacyValue: true,
        hasApprovedBillingEvidence: false,
      })
    ).toBe('unknown');
    expect(
      migrateLegacyPaidTier({
        legacyValue: true,
        hasApprovedBillingEvidence: true,
      })
    ).toBe('yes');
    expect(
      migrateLegacyPaidTier({
        legacyValue: false,
        hasApprovedBillingEvidence: false,
      })
    ).toBe('no');
  });

  it('records comparable incumbent and current decisions without rewriting history', () => {
    const comparison = compareQualificationDecisions({
      incumbentDecision: 'qualified',
      incumbentReason: null,
      current: {
        state: 'review_needed',
        reasons: ['buy_intent_unknown'],
        evidenceIds: ['obs-profile'],
      },
    });
    expect(comparison).toEqual({
      incumbent: { decision: 'qualified', reason: null },
      current: expect.objectContaining({ state: 'review_needed' }),
      changed: true,
      compatibilityPolicy: 'preserve_incumbent_record_requalify',
    });
    expect(PUBLIC_SIGNAL_POLICY_REGISTRY.linktree.rules).toMatchObject({
      brandingAbsent: 'paid_access_unknown',
      identityBadge: 'identity_only',
      toolLink: 'usage_only',
    });
  });

  it('classifies tool relationships only from current capability evidence', () => {
    expect(
      classifyToolRelationship({
        capabilitySupportsReplacement: false,
        capabilitySupportsComplement: false,
        requiredForDelivery: false,
      })
    ).toBe('unknown');
    expect(
      classifyToolRelationship({
        capabilitySupportsReplacement: true,
        capabilitySupportsComplement: false,
        requiredForDelivery: false,
      })
    ).toBe('replacement');
  });
});
