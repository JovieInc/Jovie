import { describe, expect, it } from 'vitest';
import { INVESTOR_ANSWER_REUSE_PACK } from '@/data/investorAnswerReuseCopy';
import { applyAnswerSourceChange } from './answer-reuse-invalidation';
import type { AnswerDerivative, AnswerReusePack } from './answer-reuse-types';

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

describe('applyAnswerSourceChange', () => {
  it('refuses a source answer with a different answer id', () => {
    const pack = reviewedPack();
    const foreign = { ...pack.sourceAnswer, answerId: 'other-answer' };

    expect(() =>
      applyAnswerSourceChange(pack, foreign, {
        type: 'answer-revision',
        at: '2026-10-01T09:30:00.000Z',
        actor: 'Evidence owner',
        reason: 'Wrong answer supplied.',
      })
    ).toThrow('Source changes must preserve the canonical answer id.');
  });

  it.each(['not-a-date', '2026-10-01', '2026-13-99T99:99:99.999Z'])(
    'rejects source changes without a real ISO event date: %s',
    at => {
      const pack = reviewedPack();

      expect(() =>
        applyAnswerSourceChange(pack, pack.sourceAnswer, {
          type: 'answer-revision',
          at,
          actor: 'Evidence owner',
          reason: 'No timestamp.',
        })
      ).toThrow('Source changes require a real ISO event date.');
    }
  );

  it('withdraws every derivative and requires privacy-safe removal on answer withdrawal', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const withdrawn = { ...pack.sourceAnswer, version: 'withdrawn-v2' };

    const result = applyAnswerSourceChange(pack, withdrawn, {
      type: 'answer-withdrawal',
      at: '2026-10-02T10:00:00.000Z',
      actor: 'Evidence owner',
      reason: 'Answer withdrawn pending re-review.',
    });

    expect(result.impactedDerivativeIds).toEqual(
      pack.derivatives.map(derivative => derivative.derivativeId)
    );
    expect(result.releaseActions).toEqual([
      {
        derivativeId: 'company-identity-customer-explanation',
        action: 'privacy-safe-remove-through-existing-release',
      },
    ]);
    for (const derivative of result.pack.derivatives) {
      expect(derivative.review.state).toBe('withdrawn');
      expect(derivative.history.at(-1)).toMatchObject({
        event: 'source-change',
        previousReviewState: 'approved',
        previousReviewedBy: 'Editorial reviewer',
        previousReviewedAt: REVIEWED_AT,
      });
    }
  });

  it('requires privacy-safe removal only for published derivatives on claim withdrawal', () => {
    const pack = reviewedPack({ publishCustomer: true });
    const changedClaimId = pack.derivatives[0]?.claimUses[0]?.claimId;
    expect(changedClaimId).toBeDefined();

    const result = applyAnswerSourceChange(pack, pack.sourceAnswer, {
      type: 'claim-withdrawal',
      at: '2026-10-02T10:00:00.000Z',
      actor: 'Evidence owner',
      reason: 'Claim evidence withdrawn.',
      changedClaimIds: [changedClaimId as string],
    });

    expect(result.impactedDerivativeIds.length).toBeGreaterThan(0);
    expect(result.releaseActions).toEqual([
      {
        derivativeId: 'company-identity-customer-explanation',
        action: 'privacy-safe-remove-through-existing-release',
      },
    ]);
    for (const derivative of result.pack.derivatives) {
      expect(derivative.review.state).toBe('needs-review');
    }
  });

  it('leaves derivatives untouched when a changed claim is not used by them', () => {
    const pack = reviewedPack({ publishCustomer: true });

    const result = applyAnswerSourceChange(pack, pack.sourceAnswer, {
      type: 'claim-evidence-change',
      at: '2026-10-02T10:00:00.000Z',
      actor: 'Evidence owner',
      reason: 'Unused claim corrected.',
      changedClaimIds: ['claim-not-referenced-by-any-derivative'],
    });

    expect(result.impactedDerivativeIds).toEqual([]);
    expect(result.releaseActions).toEqual([]);
    expect(result.pack.derivatives).toEqual(pack.derivatives);
  });
});
