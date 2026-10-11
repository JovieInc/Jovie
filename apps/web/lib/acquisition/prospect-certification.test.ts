import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROSPECT_CERTIFICATION_POLICY,
  deriveProspectReviewPolicy,
  evaluateProspectCertification,
  evaluateProspectOutreachGate,
  type ProspectResolutionEvidence,
  type ProspectReviewReceipt,
  summarizeProspectReviewOutcomes,
} from './prospect-certification';

const now = '2026-09-30T00:00:00.000Z';

function evidence(
  overrides: Partial<ProspectResolutionEvidence> = {}
): ProspectResolutionEvidence {
  return {
    prospectId: 'prospect-1',
    canonicalArtistName: 'Baby Keem',
    identityConfidence: 0.97,
    dspIdentities: [
      {
        provider: 'spotify',
        artistId: '5SXUUuA6ZN8UmJSdct765J',
        url: 'https://open.spotify.com/artist/5SXUUuA6ZN8UmJSdct765J',
        matchScore: 0.99,
      },
      {
        provider: 'apple_music',
        artistId: '1307667134',
        url: 'https://music.apple.com/artist/1307667134',
        matchScore: 0.97,
      },
    ],
    releases: [
      {
        title: 'The Melodic Blue',
        provider: 'spotify',
        url: 'https://open.spotify.com/album/x',
      },
    ],
    destinations: [
      {
        kind: 'official_site',
        url: 'https://babykeem.com',
        status: 'ok',
      },
      {
        kind: 'social',
        url: 'https://instagram.com/babykeem',
        status: 'ok',
      },
    ],
    contradictions: [],
    unknowns: [
      { field: 'official_site', material: false, note: 'No fan wiki check.' },
    ],
    profileQualityPassed: true,
    resolverVersion: 'jovie.music-resolver/1.0.0',
    providerSources: ['spotify', 'apple_music', 'musicbrainz'],
    observedAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateProspectCertification', () => {
  it('certifies a fully resolved, fresh, contradiction-free prospect', () => {
    const verdict = evaluateProspectCertification(evidence(), now);
    expect(verdict.tier).toBe('certified');
    expect(verdict.requiresHumanReview).toBe(false);
    expect(verdict.reviewReasons).toEqual([]);
    expect(verdict.machineConfidence).toBeGreaterThan(0.9);
    expect(verdict.nonMaterialUnknowns).toHaveLength(1);
    expect(verdict.contract).toBe('jovie.prospect-certification/v1');
  });

  it('marks machine confidence before review, not as human approval', () => {
    const verdict = evaluateProspectCertification(
      evidence({ identityConfidence: 0.8 }),
      now
    );
    expect(verdict.tier).toBe('review_required');
    expect(verdict.reviewReasons).toContain('ambiguous_identity');
    expect(verdict.machineConfidence).toBeLessThan(0.9);
  });

  it('marks identity below the review floor as insufficient', () => {
    const verdict = evaluateProspectCertification(
      evidence({ identityConfidence: 0.3 }),
      now
    );
    expect(verdict.tier).toBe('insufficient');
    expect(verdict.requiresHumanReview).toBe(true);
  });

  it('queues review for same-name collisions and catalog mismatches', () => {
    const verdict = evaluateProspectCertification(
      evidence({
        contradictions: [
          {
            kind: 'same_name_collision',
            material: true,
            summary: 'Two artists share the name.',
          },
          {
            kind: 'catalog_mismatch',
            material: false,
            summary: 'Release not on claimed artist page.',
          },
        ],
      }),
      now
    );
    expect(verdict.reviewReasons).toEqual(
      expect.arrayContaining(['material_contradiction', 'catalog_or_credit'])
    );
    expect(verdict.materialContradictions).toHaveLength(1);
  });

  it('flags suspicious socials, broken destinations, and material unknowns', () => {
    const verdict = evaluateProspectCertification(
      evidence({
        destinations: [
          { kind: 'social', url: 'https://x.com/x', status: 'broken' },
        ],
        contradictions: [
          {
            kind: 'social_mismatch',
            material: false,
            summary: 'Handle points at a fan account.',
          },
        ],
        unknowns: [
          {
            field: 'dsp_catalog',
            material: true,
            note: 'Apple Music artist unresolved.',
          },
        ],
      }),
      now
    );
    expect(verdict.reviewReasons).toEqual(
      expect.arrayContaining([
        'suspicious_social_or_site',
        'catalog_or_credit',
        'insufficient_coverage',
      ])
    );
  });

  it('treats evidence older than the campaign window as stale', () => {
    const verdict = evaluateProspectCertification(
      evidence({ observedAt: '2026-07-01T00:00:00.000Z' }),
      now
    );
    expect(verdict.reviewReasons).toContain('stale_evidence');
    expect(verdict.evidenceAgeDays).toBeGreaterThan(30);
  });

  it('requires covered fields before certifying', () => {
    const verdict = evaluateProspectCertification(
      evidence({ dspIdentities: [] }),
      now
    );
    expect(verdict.coverage.dsp_catalog).toBe(false);
    expect(verdict.reviewReasons).toContain('insufficient_coverage');
  });

  it('honors advisory review reasons except material contradictions', () => {
    const policy = {
      ...DEFAULT_PROSPECT_CERTIFICATION_POLICY,
      advisoryReviewReasons: [
        'ambiguous_identity',
        'material_contradiction',
      ] as const,
    };
    const verdict = evaluateProspectCertification(
      evidence({ identityConfidence: 0.8 }),
      now,
      policy
    );
    expect(verdict.reviewReasons).toEqual([]);
    expect(verdict.advisoryReasons).toEqual(['ambiguous_identity']);
    expect(verdict.tier).toBe('certified');

    const contradiction = evaluateProspectCertification(
      evidence({
        contradictions: [
          {
            kind: 'split_identity',
            material: true,
            summary: 'Catalog split across two artist pages.',
          },
        ],
      }),
      now,
      policy
    );
    expect(contradiction.reviewReasons).toContain('material_contradiction');
  });

  it('rejects malformed evidence envelopes', () => {
    expect(() =>
      evaluateProspectCertification(
        evidence({ resolverVersion: 'not a version!' }),
        now
      )
    ).toThrow('Invalid prospect resolution evidence envelope.');
  });
});

describe('evaluateProspectOutreachGate', () => {
  it('admits a certified prospect with fresh evidence', () => {
    const verdict = evaluateProspectCertification(evidence(), now);
    const gate = evaluateProspectOutreachGate({
      verdict,
      humanReviewApproved: false,
    });
    expect(gate).toEqual({ eligible: true, blockers: [] });
  });

  it('blocks outreach while required human review is pending', () => {
    const verdict = evaluateProspectCertification(
      evidence({ identityConfidence: 0.8 }),
      now
    );
    expect(
      evaluateProspectOutreachGate({ verdict, humanReviewApproved: false })
        .blockers
    ).toContain('human_review_pending');
    expect(
      evaluateProspectOutreachGate({ verdict, humanReviewApproved: true })
    ).toEqual({ eligible: true, blockers: [] });
  });

  it('blocks insufficient identity, contradictions, quality, and staleness', () => {
    const verdict = evaluateProspectCertification(
      evidence({
        identityConfidence: 0.2,
        profileQualityPassed: false,
        observedAt: '2026-01-01T00:00:00.000Z',
        contradictions: [
          {
            kind: 'same_name_collision',
            material: true,
            summary: 'Embarrassing mis-pitch risk.',
          },
        ],
      }),
      now
    );
    const gate = evaluateProspectOutreachGate({
      verdict,
      humanReviewApproved: true,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.blockers).toEqual(
      expect.arrayContaining([
        'identity_not_certified',
        'material_contradiction',
        'profile_quality',
        'stale_evidence',
      ])
    );
  });
});

describe('prospect review learning loop', () => {
  const receipt = (
    overrides: Partial<ProspectReviewReceipt> = {}
  ): ProspectReviewReceipt => ({
    prospectId: 'p',
    machineVerdict: 'review_required',
    machineConfidence: 0.7,
    reviewReasons: ['ambiguous_identity'],
    decision: 'yes',
    corrections: [],
    falsePositiveType: null,
    provider: 'spotify',
    resolverVersion: 'jovie.music-resolver/1.0.0',
    decidedAt: now,
    ...overrides,
  });

  it('measures machine-vs-human disagreement and false-positive types', () => {
    const stats = summarizeProspectReviewOutcomes([
      receipt({ decision: 'yes' }),
      receipt({
        decision: 'no',
        falsePositiveType: 'same_name_collision',
      }),
      receipt({
        decision: 'unsure',
        corrections: ['wrong catalog link'],
      }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.disagreements).toBe(2);
    expect(stats.disagreementRate).toBeCloseTo(2 / 3);
    expect(stats.byReason.ambiguous_identity).toEqual({
      decided: 3,
      disagreed: 2,
    });
    expect(stats.falsePositives.same_name_collision).toBe(1);
  });

  it('ladders a precise reason to advisory only after enough decisions', () => {
    const precise = summarizeProspectReviewOutcomes(
      Array.from({ length: 12 }, () =>
        receipt({ reviewReasons: ['ambiguous_identity'] })
      )
    );
    const next = deriveProspectReviewPolicy(
      DEFAULT_PROSPECT_CERTIFICATION_POLICY,
      precise
    );
    expect(next.advisoryReviewReasons).toContain('ambiguous_identity');

    const sparse = summarizeProspectReviewOutcomes([
      receipt({ reviewReasons: ['stale_evidence'] }),
    ]);
    const unchanged = deriveProspectReviewPolicy(
      DEFAULT_PROSPECT_CERTIFICATION_POLICY,
      sparse
    );
    expect(unchanged.advisoryReviewReasons).not.toContain('stale_evidence');

    const noisy = summarizeProspectReviewOutcomes(
      Array.from({ length: 12 }, () =>
        receipt({ reviewReasons: ['material_contradiction'], decision: 'yes' })
      )
    );
    const policy = deriveProspectReviewPolicy(
      DEFAULT_PROSPECT_CERTIFICATION_POLICY,
      noisy
    );
    expect(policy.advisoryReviewReasons).not.toContain(
      'material_contradiction'
    );
  });
});
