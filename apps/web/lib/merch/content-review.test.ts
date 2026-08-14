import { describe, expect, it } from 'vitest';
import type { MerchPrintfulSnapshot } from '@/lib/db/schema/merch';
import {
  getMerchContentReviewBlockers,
  MERCH_CONTENT_CONTRACT_VERSION,
  MERCH_CONTENT_REVIEW_REQUIRED_BLOCKER,
  MERCH_CONTENT_REVIEWER_VERSION,
  MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
  readMerchContentReview,
  stampMerchContentReview,
} from './content-contract';
import {
  evaluateMerchCandidateReadiness,
  reviewMerchContent,
} from './content-review';
import { MERCH_CONTENT_REVIEW_FIXTURES } from './content-review-fixtures';
import { buildMerchPricingSnapshot } from './pricing';
import { getMerchCardSellability } from './safety';

const REVIEWED_AT = '2026-08-14T05:00:00.000Z';

function reviewFixture(id: string) {
  const fixture = MERCH_CONTENT_REVIEW_FIXTURES.find(item => item.id === id);
  if (!fixture) throw new Error(`Missing fixture ${id}`);
  return {
    fixture,
    review: reviewMerchContent(fixture.subject, new Date(REVIEWED_AT)),
  };
}

function printfulSnapshot(): MerchPrintfulSnapshot {
  return {
    catalogProductId: 71,
    catalogVariantIds: [4011],
    variantMap: { S_black: 4011 },
    placements: ['front'],
    techniques: ['dtg'],
    printFileUrls: ['https://cdn.test/print.png'],
    availabilityRegion: 'US',
    shippingProfile: 'printful_standard_us',
    catalogCostSource: 'printful',
    catalogCostUpdatedAt: REVIEWED_AT,
  };
}

describe('merch content review (JOV-4740)', () => {
  it('rejects a fixture containing a generated person before ready', () => {
    const { review } = reviewFixture('literal-generated-person');
    const gate = evaluateMerchCandidateReadiness(review);

    expect(review.verdict).toBe('reject');
    expect(review.failureCodes).toEqual(
      expect.arrayContaining(['person.human', 'person.face', 'person.portrait'])
    );
    expect(gate).toEqual({ ready: false, optionStatus: 'rejected' });
    expect(
      getMerchContentReviewBlockers(stampMerchContentReview(review))
    ).toEqual([MERCH_PERSON_CONTENT_PUBLISH_BLOCKER]);
  });

  it('passes a normal illustrated mascot/animal graphic', () => {
    const { review } = reviewFixture('fox-mascot-pass');
    const gate = evaluateMerchCandidateReadiness(review);

    expect(review.verdict).toBe('pass');
    expect(review.failureCodes).toEqual([]);
    expect(gate).toEqual({ ready: true, optionStatus: 'candidate' });
    expect(
      getMerchContentReviewBlockers(stampMerchContentReview(review))
    ).toEqual([]);
  });

  it('persists structured review evidence on the qualityReview stamp', () => {
    const { review } = reviewFixture('literal-generated-person');
    const stamp = stampMerchContentReview(review);
    const readBack = readMerchContentReview(stamp);

    expect(stamp).toMatchObject({
      contentContractVersion: MERCH_CONTENT_CONTRACT_VERSION,
      contentReviewerVersion: MERCH_CONTENT_REVIEWER_VERSION,
    });
    expect(readBack).toEqual({
      contractVersion: MERCH_CONTENT_CONTRACT_VERSION,
      reviewerVersion: MERCH_CONTENT_REVIEWER_VERSION,
      mode: 'graphic_only',
      verdict: 'reject',
      failureCodes: review.failureCodes,
      confidence: review.confidence,
      reviewedAt: REVIEWED_AT,
    });
  });

  it('blocks publish/sellability for a critical person-content hit', () => {
    const { review } = reviewFixture('literal-generated-person');
    const result = getMerchCardSellability({
      currency: 'USD',
      retailPriceCents: 4500,
      estimatedPrintfulProductCostCents: 1750,
      artistRoyaltyRateBps: 5000,
      pricing: buildMerchPricingSnapshot(),
      primaryImageUrl: 'https://cdn.test/mockup.png',
      mockupUrls: ['https://cdn.test/mockup.png'],
      printful: printfulSnapshot(),
      qualityReview: {
        contractVersion: 'merch-generation/v1',
        ...stampMerchContentReview(review),
      },
    });

    expect(result.sellable).toBe(false);
    expect(result.reasons).toContain(MERCH_PERSON_CONTENT_PUBLISH_BLOCKER);
  });

  it('fails closed when a canonical option is missing review evidence', () => {
    expect(
      getMerchContentReviewBlockers({
        contractVersion: 'merch-generation/v1',
      })
    ).toEqual([MERCH_CONTENT_REVIEW_REQUIRED_BLOCKER]);
  });

  it('does not treat the no-people contract boilerplate as a person hit', () => {
    const { review } = reviewFixture('contract-boilerplate-pass');
    expect(review.verdict).toBe('pass');
  });
});

describe('merch person-content evaluation lane', () => {
  it('fails closed if any confirmed person fixture escapes', () => {
    const escapes = MERCH_CONTENT_REVIEW_FIXTURES.filter(fixture => {
      const review = reviewMerchContent(fixture.subject);
      const gate = evaluateMerchCandidateReadiness(review);
      const blockers = getMerchContentReviewBlockers(
        stampMerchContentReview(review)
      );
      const ready = gate.ready;
      const publishable = blockers.length === 0;
      if (fixture.expected === 'reject') {
        return review.verdict !== 'reject' || ready || publishable;
      }
      return review.verdict !== 'pass' || !ready || !publishable;
    }).map(fixture => fixture.id);

    expect(escapes).toEqual([]);
  });
});
