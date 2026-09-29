import { describe, expect, it } from 'vitest';
import { INVESTOR_ANSWER_REUSE_PACK } from '@/data/investorAnswerReuseCopy';
import {
  type AnswerDerivative,
  type AnswerReusePack,
  buildPublicDiscoveryProjection,
  type CanonicalAnswerClaim,
  validateAnswerReusePack,
} from './answer-reuse';

const REVIEWED_AT = '2026-09-28T12:00:00.000Z';

function claim(partial: Partial<CanonicalAnswerClaim>): CanonicalAnswerClaim {
  return {
    claimId: 'test-claim',
    revisionId: 'test-claim-r1',
    kind: 'identity',
    assertion: 'observed-fact',
    subject: 'Test subject',
    statement: 'A test statement.',
    disclosure: 'public',
    evidenceQuality: 'verified',
    evidenceRefs: ['test/evidence'],
    asOf: '2026-09-01',
    reviewedBy: 'Tim White',
    reviewedAt: '2026-09-17',
    limitations: [],
    revisedAt: '2026-09-17',
    ...partial,
  };
}

const customerTemplate = INVESTOR_ANSWER_REUSE_PACK.derivatives.find(
  derivative => derivative.channel === 'customer-editorial'
)!;

function publishedDerivative(
  derivativeId: string,
  canonicalPath: string,
  claimUses: AnswerDerivative['claimUses']
): AnswerDerivative {
  return {
    ...customerTemplate,
    derivativeId,
    canonicalPath,
    claimUses,
    review: {
      state: 'approved',
      reviewedBy: 'Editorial reviewer',
      reviewedAt: REVIEWED_AT,
    },
    distribution: {
      ...customerTemplate.distribution,
      publicPublishing: {
        state: 'approved',
        approvedBy: 'Publishing owner',
        decidedAt: REVIEWED_AT,
      },
    },
    releaseState: 'published',
  };
}

function packOf(
  claims: readonly CanonicalAnswerClaim[],
  derivatives: readonly AnswerDerivative[]
): AnswerReusePack {
  return {
    sourceAnswer: { ...INVESTOR_ANSWER_REUSE_PACK.sourceAnswer, claims },
    derivatives,
  };
}

function useOf(claim: CanonicalAnswerClaim): AnswerDerivative['claimUses'] {
  return [
    {
      claimId: claim.claimId,
      revisionId: claim.revisionId,
      emphasis: 'Test use.',
    },
  ];
}

describe('canonical claim freshness and assertion rules (JOV-5024)', () => {
  it('rejects measured claims without an attached cohort and sample size', () => {
    const issues = validateAnswerReusePack(
      packOf(
        [
          claim({
            kind: 'measured-outcome',
            statement: 'Creators saved time.',
            limitations: ['Directional result.'],
          }),
        ],
        []
      )
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'measured-claim-cohort' }),
      ])
    );
  });

  it('rejects hypotheses and forecasts presented as demonstrated performance', () => {
    const issues = validateAnswerReusePack(
      packOf(
        [
          claim({
            assertion: 'hypothesis',
            evidenceQuality: 'verified',
            limitations: ['Unvalidated.'],
          }),
          claim({ assertion: 'forecast', evidenceQuality: 'hypothesis' }),
        ],
        []
      )
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unproven-claim-quality' }),
        expect.objectContaining({ code: 'forecast-freshness' }),
        expect.objectContaining({ code: 'claim-limitations' }),
      ])
    );
  });

  it('fails closed on availability claims for non-public or unusable capabilities', () => {
    const issues = validateAnswerReusePack(
      packOf(
        [
          claim({
            kind: 'current-availability',
            subject: 'Selective reach availability',
            statement: 'Selective reach is available now.',
            evidenceRefs: [
              'apps/web/data/marketing/featureAvailability.ts#selective-reach',
            ],
          }),
          claim({
            claimId: 'no-capability-ref',
            kind: 'current-availability',
            evidenceRefs: ['some/other-source'],
          }),
          claim({
            claimId: 'ghost-capability',
            kind: 'current-availability',
            evidenceRefs: [
              'apps/web/data/marketing/featureAvailability.ts#does-not-exist',
            ],
          }),
        ],
        []
      )
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unpublished-capability-claim' }),
        expect.objectContaining({ code: 'unavailable-capability-fact' }),
        expect.objectContaining({ code: 'capability-evidence-required' }),
        expect.objectContaining({ code: 'unknown-capability' }),
      ])
    );
  });

  it('expires only the derivatives that use stale claim evidence', () => {
    const stale = claim({
      claimId: 'stale-metric',
      kind: 'measured-outcome',
      statement: 'A measured result.',
      limitations: ['Bounded sample.'],
      cohort: { label: 'Pilot cohort', sampleSize: 4 },
      expiresAt: '2026-09-20',
    });
    const fresh = claim({ claimId: 'fresh-identity' });
    const pack = packOf(
      [stale, fresh],
      [
        publishedDerivative('uses-stale', '/blog/uses-stale', useOf(stale)),
        publishedDerivative('uses-fresh', '/blog/uses-fresh', useOf(fresh)),
      ]
    );

    const issues = validateAnswerReusePack(pack, {
      evaluatedAt: '2026-09-28T00:00:00.000Z',
    });
    expect(
      issues.filter(issue => issue.code === 'expired-claim-evidence')
    ).toEqual([expect.objectContaining({ derivativeId: 'uses-stale' })]);

    const projection = buildPublicDiscoveryProjection(pack, {
      evaluatedAt: '2026-09-28T00:00:00.000Z',
    });
    expect(
      projection.editorialEntries.map(entry => entry.derivativeId)
    ).toEqual(['uses-fresh']);
    expect(projection.rejections).toEqual([
      {
        derivativeId: 'uses-stale',
        codes: ['expired-claim-evidence'],
      },
    ]);
  });

  it('keeps fresh claims publishable inside their freshness window', () => {
    const current = claim({
      claimId: 'in-window',
      expiresAt: '2026-10-15',
    });
    const pack = packOf(
      [current],
      [publishedDerivative('in-window-post', '/blog/in-window', useOf(current))]
    );
    const projection = buildPublicDiscoveryProjection(pack, {
      evaluatedAt: '2026-09-28T00:00:00.000Z',
    });
    expect(projection.rejections).toEqual([]);
    expect(projection.editorialEntries).toHaveLength(1);
  });
});
