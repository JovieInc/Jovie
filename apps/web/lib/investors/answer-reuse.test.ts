import { describe, expect, it } from 'vitest';
import { INVESTOR_ANSWER_REUSE_PACK } from '@/data/investorAnswerReuseCopy';
import {
  type AnswerDerivative,
  type AnswerReusePack,
  applyAnswerSourceChange,
  buildPublicDiscoveryProjection,
  validateAnswerReusePack,
} from './answer-reuse';

const REVIEWED_AT = '2026-09-28T12:00:00.000Z';

function approveDerivative(
  derivative: AnswerDerivative,
  options: { readonly publish?: boolean } = {}
): AnswerDerivative {
  return {
    ...derivative,
    review: {
      state: 'approved',
      reviewedBy: 'Editorial reviewer',
      reviewedAt: REVIEWED_AT,
    },
    distribution: {
      ...derivative.distribution,
      publicPublishing: options.publish
        ? {
            state: 'approved',
            approvedBy: 'Publishing owner',
            decidedAt: REVIEWED_AT,
          }
        : derivative.distribution.publicPublishing,
    },
    releaseState: options.publish ? 'published' : derivative.releaseState,
  };
}

function reviewedPack(
  options: { readonly publishCustomer?: boolean } = {}
): AnswerReusePack {
  return {
    sourceAnswer: INVESTOR_ANSWER_REUSE_PACK.sourceAnswer,
    derivatives: INVESTOR_ANSWER_REUSE_PACK.derivatives.map(derivative =>
      approveDerivative(derivative, {
        publish:
          options.publishCustomer === true &&
          derivative.channel === 'customer-editorial',
      })
    ),
  };
}

describe('investor answer reuse pack', () => {
  it('prepares distinct investor, customer, and hiring treatments from the same claims', () => {
    expect(validateAnswerReusePack(INVESTOR_ANSWER_REUSE_PACK)).toEqual([]);

    const channels = INVESTOR_ANSWER_REUSE_PACK.derivatives.map(
      derivative => derivative.channel
    );
    expect(channels).toEqual([
      'investor-deck',
      'customer-editorial',
      'recruiting-narrative',
    ]);

    const claimBindings = INVESTOR_ANSWER_REUSE_PACK.derivatives.map(
      derivative =>
        derivative.claimUses.map(
          claimUse => `${claimUse.claimId}@${claimUse.revisionId}`
        )
    );
    expect(new Set(claimBindings.map(binding => binding.join('|'))).size).toBe(
      1
    );
    expect(
      new Set(
        INVESTOR_ANSWER_REUSE_PACK.derivatives.map(
          derivative => derivative.content.summary
        )
      ).size
    ).toBe(3);

    for (const derivative of INVESTOR_ANSWER_REUSE_PACK.derivatives) {
      expect(derivative.review.state).toBe('draft');
      expect(derivative.intendedUse).not.toBe('');
      expect(derivative.nextStep).not.toBe('');
      expect(derivative.usageReceipts).toEqual([]);
      expect(
        Object.values(derivative.distribution).every(
          decision => decision.state === 'not-approved'
        )
      ).toBe(true);
    }
  });

  it('uses one approved representation for editorial, sitemap, and agent discovery', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const projection = buildPublicDiscoveryProjection(pack);
    const customer = pack.derivatives.find(
      derivative => derivative.channel === 'customer-editorial'
    );

    expect(projection.rejections).toEqual([]);
    expect(customer?.distribution.emailSocialSending.state).toBe(
      'not-approved'
    );
    expect(customer?.distribution.paidPromotion.state).toBe('not-approved');
    expect(projection.editorialEntries).toHaveLength(1);
    expect(projection.sitemapEntries).toEqual([
      {
        canonicalPath: '/blog/one-profile-for-your-work',
        lastModified: '2026-09-28',
      },
    ]);
    expect(projection.agentEntries).toEqual([
      {
        canonicalPath: projection.editorialEntries[0]?.canonicalPath,
        title: projection.editorialEntries[0]?.title,
        summary: projection.editorialEntries[0]?.summary,
        sections: projection.editorialEntries[0]?.sections,
        claimIds: projection.editorialEntries[0]?.claims.map(
          claim => claim.claimId
        ),
        lastModified: projection.editorialEntries[0]?.lastModified,
      },
    ]);
    expect(
      projection.editorialEntries[0]?.claims.map(claim => claim.kind)
    ).toEqual(['identity', 'current-availability']);
  });

  it('revokes stale approvals and identifies every derivative affected by a claim correction', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const nextSource = {
      ...pack.sourceAnswer,
      version: 'jov-6261-2026-10-01',
      claims: pack.sourceAnswer.claims.map(claim =>
        claim.claimId === 'public-profile-availability'
          ? {
              ...claim,
              revisionId: 'jov-6216-public-profile-2026-10-01',
              revisedAt: '2026-10-01',
            }
          : claim
      ),
    };

    const result = applyAnswerSourceChange(pack, nextSource, {
      type: 'claim-evidence-change',
      at: '2026-10-01T09:30:00.000Z',
      actor: 'Evidence owner',
      reason: 'Public-profile availability evidence changed.',
      changedClaimIds: ['public-profile-availability'],
    });

    expect(result.impactedDerivativeIds).toEqual(
      pack.derivatives.map(derivative => derivative.derivativeId)
    );
    expect(result.releaseActions).toEqual([
      {
        derivativeId: 'company-identity-customer-explanation',
        action: 'correct-through-existing-release',
      },
    ]);
    for (const derivative of result.pack.derivatives) {
      expect(derivative.review.state).toBe('needs-review');
      expect(derivative.history.at(-1)).toMatchObject({
        event: 'source-change',
        toSourceVersion: nextSource.version,
      });
    }
    expect(
      result.pack.derivatives.find(
        derivative =>
          derivative.derivativeId === 'company-identity-customer-explanation'
      )
    ).toMatchObject({
      releaseState: 'correction-required',
      distribution: { publicPublishing: { state: 'revoked' } },
    });
    expect(
      buildPublicDiscoveryProjection(result.pack).editorialEntries
    ).toEqual([]);
  });

  it('rejects a private claim from every machine-readable public projection', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const privateClaim = {
      claimId: 'private-customer-example',
      revisionId: 'private-example-r1',
      kind: 'measured-outcome' as const,
      assertion: 'observed-fact' as const,
      subject: 'Customer Alpha private result',
      statement: 'Private customer Alpha reported an unapproved result.',
      disclosure: 'private-investor' as const,
      evidenceQuality: 'verified' as const,
      evidenceRefs: ['private/customer-alpha'],
      asOf: '2026-09-28',
      reviewedBy: 'Tim White',
      reviewedAt: '2026-09-28',
      limitations: ['Single private customer report; not a cohort result.'],
      cohort: { label: 'Private customer Alpha', sampleSize: 1 },
      revisedAt: '2026-09-28',
    };
    const customer = pack.derivatives.find(
      derivative => derivative.channel === 'customer-editorial'
    );
    expect(customer).toBeDefined();

    const unsafePack: AnswerReusePack = {
      sourceAnswer: {
        ...pack.sourceAnswer,
        claims: [...pack.sourceAnswer.claims, privateClaim],
      },
      derivatives: pack.derivatives.map(derivative =>
        derivative.channel === 'customer-editorial'
          ? {
              ...derivative,
              claimUses: [
                ...derivative.claimUses,
                {
                  claimId: privateClaim.claimId,
                  revisionId: privateClaim.revisionId,
                  emphasis: 'Use the private result as proof.',
                },
              ],
            }
          : derivative
      ),
    };

    const projection = buildPublicDiscoveryProjection(unsafePack);
    expect(projection.editorialEntries).toEqual([]);
    expect(projection.sitemapEntries).toEqual([]);
    expect(projection.agentEntries).toEqual([]);
    expect(projection.rejections).toEqual([
      {
        derivativeId: customer?.derivativeId,
        codes: ['private-claim'],
      },
    ]);
  });

  it('rejects duplicate canonical ownership before public projection', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const customer = pack.derivatives.find(
      derivative => derivative.channel === 'customer-editorial'
    );
    expect(customer).toBeDefined();
    if (!customer) return;

    const duplicate: AnswerReusePack = {
      sourceAnswer: pack.sourceAnswer,
      derivatives: [
        customer,
        { ...customer, derivativeId: 'duplicate-customer-article' },
      ],
    };
    const projection = buildPublicDiscoveryProjection(duplicate);

    expect(projection.editorialEntries).toEqual([]);
    expect(projection.rejections).toHaveLength(2);
    expect(
      projection.rejections.every(rejection =>
        rejection.codes.includes('duplicate-canonical')
      )
    ).toBe(true);
  });

  it('does not let a draft grant any distribution permission', () => {
    const customer = INVESTOR_ANSWER_REUSE_PACK.derivatives.find(
      derivative => derivative.channel === 'customer-editorial'
    );
    expect(customer).toBeDefined();
    if (!customer) return;

    const invalidPack: AnswerReusePack = {
      sourceAnswer: INVESTOR_ANSWER_REUSE_PACK.sourceAnswer,
      derivatives: [
        {
          ...customer,
          distribution: {
            ...customer.distribution,
            emailSocialSending: {
              state: 'approved',
              approvedBy: 'Channel owner',
              decidedAt: REVIEWED_AT,
            },
          },
        },
      ],
    };

    expect(validateAnswerReusePack(invalidPack)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'draft-distribution' }),
      ])
    );
  });
});
