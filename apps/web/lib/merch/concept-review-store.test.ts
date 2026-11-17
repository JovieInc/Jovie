import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  merchCandidateQaReviews,
  merchDesignOptions,
} from '@/lib/db/schema/merch';
import type { MerchConceptPlan } from './concept-review';
import { syntheticConceptReview } from './concept-review.test-support';
import {
  getMerchConceptFeedback,
  reviewStoredMerchConceptPlan,
} from './concept-review-store';

const database = vi.hoisted(() => ({ select: vi.fn(), limit: vi.fn() }));

// Mock only the database boundary. Admission and stored-review validation run
// through the real implementations, including tenant and evidence checks.
vi.mock('@/lib/db', () => ({ db: { select: database.select } }));

const now = new Date('2026-11-16T05:00:00Z');
const plan: MerchConceptPlan = {
  profileId: 'synthetic-store-artist',
  artistName: 'Synthetic Store Artist',
  prompt: 'An original geometric print',
  source: {
    sourceType: 'user_provided',
    sourceText: 'Synthetic Signal',
    provenanceTitle: 'Synthetic artist input',
    rightsStatus: 'user_provided',
  },
  feedback: [],
  product: {
    catalogProductId: 71,
    catalogVariantIds: [4011],
    placements: ['front'],
    technique: 'dtg',
    colorway: 'Black',
  },
  candidates: [
    {
      key: 'synthetic-geometric-print',
      prompt: 'An original geometric band with a small source phrase',
      strategy: {
        label: 'Synthetic geometric direction',
        composition: 'One offset geometric band',
        typographyRole: 'Small readable source phrase',
        motifSystem: 'Original abstract geometry',
        palette: 'Black and bone',
        density: 'minimal',
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: database.limit,
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  database.select.mockReturnValue(query);
  database.limit.mockResolvedValue([]);
});

describe('reviewStoredMerchConceptPlan', () => {
  it('requires review when the immutable store has no matching row', async () => {
    const result = await reviewStoredMerchConceptPlan(plan, now);

    expect(database.select).toHaveBeenCalledWith({
      review: merchCandidateQaReviews,
    });
    expect(result.decision).toBe('review_required');
    expect(result.reasons).toContain('concept.review_required');
    expect(result.reviewId).toBeNull();
    expect(result.imageCallsExecuted).toBe(0);
  });

  it('rejects a wrong-artist row even if the store returns matching evidence', async () => {
    const review = syntheticConceptReview(plan, now);
    review.creatorProfileId = 'another-synthetic-artist';
    database.limit.mockResolvedValueOnce([{ review }]);

    const result = await reviewStoredMerchConceptPlan(plan, now);

    expect(result.decision).toBe('review_required');
    expect(result.reasons).toContain('concept.wrong_artist');
    expect(result.imageCallsExecuted).toBe(0);
  });

  it.each(['pending', 'rejected', 'campaign_image'] as const)(
    'blocks a persisted %s row before artwork generation',
    async state => {
      const review = syntheticConceptReview(plan, now);
      if (state === 'pending') review.disposition = 'pending';
      if (state === 'rejected') review.verdict = 'fail';
      if (state === 'campaign_image') {
        Object.assign(review.details, { phase: 'campaign_image' });
      }
      database.limit.mockResolvedValueOnce([{ review }]);

      const result = await reviewStoredMerchConceptPlan(plan, now);

      expect(result.decision).toBe('review_required');
      expect(result.reasons).toContain(
        state === 'campaign_image'
          ? 'concept.review_required'
          : 'concept.not_approved'
      );
      expect(result.imageCallsExecuted).toBe(0);
      expect(result.artworkHash).toBeNull();
    }
  );

  it('admits an exact, eligible synthetic review read from the immutable store', async () => {
    const review = syntheticConceptReview(plan, now);
    database.limit.mockResolvedValueOnce([{ review }]);

    const result = await reviewStoredMerchConceptPlan(plan, now);

    expect(result.decision).toBe('eligible');
    expect(result.reasons).toEqual([]);
    expect(result.reviewId).toBe(review.id);
    expect(result.planHash).toBe(review.inputHash);
    expect(result.rankedKeys).toEqual(['synthetic-geometric-print']);
    expect(result.imageCallsExecuted).toBe(0);
    expect(result.artworkHash).toBeNull();
  });
});

describe('getMerchConceptFeedback', () => {
  it('preserves rejected learning attributes for the next concept plan', async () => {
    const rejectedAttributes = [
      'standalone_phrase_not_wearable',
      'weak_design',
      'brand_color_mismatch',
    ];
    const storedFeedback = [
      {
        id: 'synthetic-rejected-option',
        concept: 'Synthetic rejected concept',
        learning: {
          styleLane: 'fashion_graphic_item',
          typographyStyle: 'Synthetic direction',
          graphicDensity: 'minimal',
          garmentColor: 'Black',
          motifs: ['Original abstract geometry'],
          selectedOverOptionIds: [],
          rejectedAttributes,
        },
        updatedAt: now,
      },
    ];
    database.limit.mockResolvedValueOnce(storedFeedback);

    const feedback = await getMerchConceptFeedback(plan.profileId);

    expect(database.select).toHaveBeenCalledWith({
      id: merchDesignOptions.id,
      concept: merchDesignOptions.concept,
      learning: merchDesignOptions.learning,
      updatedAt: merchDesignOptions.updatedAt,
    });
    expect(feedback).toEqual(storedFeedback);
    expect(feedback[0].learning.rejectedAttributes).toEqual(rejectedAttributes);
  });
});
