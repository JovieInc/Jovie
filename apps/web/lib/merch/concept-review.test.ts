import { describe, expect, it } from 'vitest';
import {
  getMerchConceptPublicationBlockers,
  MERCH_CONCEPT_CONTRACT,
  MERCH_CONCEPT_CRITERIA,
} from './concept-contract';
import {
  evaluateMerchConceptPlan,
  type MerchConceptPlan,
  merchConceptHash,
} from './concept-review';
import { founderFeedbackFixtures } from './concept-review.fixtures';
import { syntheticConceptReview } from './concept-review.test-support';
import { MERCH_DESIGN_STRATEGIES } from './design-strategies';

const now = new Date('2026-11-16T05:00:00Z');
const plan: MerchConceptPlan = {
  profileId: 'synthetic-artist',
  artistName: 'Synthetic Artist',
  prompt: 'An original abstract print',
  source: {
    sourceType: 'user_provided',
    sourceText: 'Synthetic phrase',
    provenanceTitle: 'Synthetic input',
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
  candidates: MERCH_DESIGN_STRATEGIES.slice(0, 3).map(strategy => ({
    key: strategy.label,
    prompt: `Original abstract graphic: ${strategy.label}`,
    strategy,
  })),
};

describe('pre-art concept admission', () => {
  it('requires persisted review; source ownership or a phrase preference is not approval', () => {
    for (const feedback of founderFeedbackFixtures) {
      const result = evaluateMerchConceptPlan(
        { ...plan, feedback: [feedback] },
        null,
        now
      );
      expect(result.decision).toBe('review_required');
      expect(result.imageCallsExecuted).toBe(0);
      expect(result.artworkHash).toBeNull();
    }
    expect(founderFeedbackFixtures[0].reasons).toEqual([
      'standalone_phrase_not_wearable',
      'weak_design',
      'taylor_swift_like_imagery',
      'brand_color_mismatch',
    ]);
  });

  it('admits and ranks exact human-reviewed concepts without claiming production clearance', () => {
    const review = syntheticConceptReview(plan, now);
    review.details.candidates[0].scores.taste = 3;
    const result = evaluateMerchConceptPlan(plan, review, now);
    expect(result.decision).toBe('eligible');
    expect(result.rankedKeys[0]).toBe(plan.candidates[1].key);
    expect(result.reviewId).toBe(review.id);
    expect(
      getMerchConceptPublicationBlockers({ conceptReview: result })
    ).not.toHaveLength(0);
  });

  it.each(['prompt', 'source', 'palette', 'product', 'feedback'] as const)(
    'invalidates review after changing %s',
    field => {
      const changed = {
        ...plan,
        source: { ...plan.source },
        candidates: plan.candidates.map(candidate => ({
          ...candidate,
          strategy: { ...candidate.strategy },
        })),
        product: { ...plan.product },
        feedback: [...plan.feedback],
      };
      if (field === 'prompt') changed.prompt = 'Different intent';
      if (field === 'source') changed.source.sourceText = 'Different phrase';
      if (field === 'palette')
        changed.candidates[0].strategy.palette = 'Different colors';
      if (field === 'product') changed.product.catalogProductId = 216;
      if (field === 'feedback')
        changed.feedback.push(founderFeedbackFixtures[0]);
      expect(
        evaluateMerchConceptPlan(
          changed,
          syntheticConceptReview(plan, now),
          now
        ).reasons
      ).toContain('concept.stale_review');
    }
  );

  it.each([
    'pending',
    'rejected',
    'wrong_artist',
    'missing_provenance',
    'stale_provenance',
    'expired',
    'campaign_image',
    'unknown_rights',
    'disputed_rights',
    'locked_layers',
    'weak_idea',
    'duplicate_review',
    'self_approved',
  ] as const)('blocks %s evidence', mutation => {
    const review = syntheticConceptReview(plan, now);
    if (mutation === 'pending') review.disposition = 'pending';
    if (mutation === 'rejected') review.verdict = 'fail';
    if (mutation === 'wrong_artist')
      review.creatorProfileId = 'different-artist';
    if (mutation === 'missing_provenance')
      review.details.sourceSnapshot.sourceId = '';
    if (mutation === 'stale_provenance')
      review.details.sourceSnapshot.digest = 'a'.repeat(64);
    if (mutation === 'expired')
      review.details.validUntil = '2026-11-15T00:00:00Z';
    if (mutation === 'campaign_image')
      Object.assign(review.details, { phase: 'campaign_image' });
    if (mutation === 'unknown_rights')
      review.details.rights[0].status = 'unknown';
    if (mutation === 'disputed_rights')
      review.details.rights[0].status = 'disputed';
    if (mutation === 'locked_layers')
      review.details.lockedLayerHashes.push('b'.repeat(64));
    if (mutation === 'weak_idea')
      review.details.candidates[1].scores.standaloneWearability = 1;
    if (mutation === 'duplicate_review')
      review.details.candidates[1].key = review.details.candidates[0].key;
    if (mutation === 'self_approved')
      Object.assign(review, {
        details: { approved: true, planHash: review.inputHash },
      });
    const result = evaluateMerchConceptPlan(plan, review, now);
    expect(result.decision).toBe('review_required');
    expect(result.imageCallsExecuted).toBe(0);
  });

  it('requires explicit calibrated-adapter registration; scores alone cannot enable a fast model', () => {
    const review = syntheticConceptReview(plan, now);
    Object.assign(review.details, {
      authority: {
        kind: 'calibrated_evaluator',
        adapterId: 'synthetic-evaluator',
        benchmarkReceiptHash: 'a'.repeat(64),
      },
    });
    expect(evaluateMerchConceptPlan(plan, review, now).reasons).toContain(
      'concept.unverified_evaluator'
    );
    expect(
      evaluateMerchConceptPlan(plan, review, now, [
        { id: 'synthetic-evaluator', benchmarkReceiptHash: 'b'.repeat(64) },
      ]).decision
    ).toBe('review_required');
  });

  it('blocks invented tour dates, even with otherwise approved concepts', () => {
    const dated = { ...plan, prompt: 'Tour 2027-05-01' };
    expect(
      evaluateMerchConceptPlan(dated, syntheticConceptReview(dated, now), now)
        .reasons
    ).toContain('concept.unsourced_date');
  });

  it('rejects overlapping disputed grants and private-render-only permission', () => {
    const disputed = syntheticConceptReview(plan, now);
    disputed.details.rights.push({
      ...disputed.details.rights[0],
      status: 'disputed',
    });
    expect(evaluateMerchConceptPlan(plan, disputed, now).decision).toBe(
      'review_required'
    );
    const privateOnly = syntheticConceptReview(plan, now);
    privateOnly.details.rights = privateOnly.details.rights.filter(
      right => right.use === 'concept_render'
    );
    expect(evaluateMerchConceptPlan(plan, privateOnly, now).reasons).toContain(
      'rights.not_cleared:public_artifact_hosting:original_graphic'
    );
  });

  it('keeps references and negative feedback in the hash, not positive render instructions', () => {
    const feedback = [founderFeedbackFixtures[0]];
    const result = evaluateMerchConceptPlan({ ...plan, feedback }, null, now);
    expect(result.feedbackHash).toBe(merchConceptHash(feedback));
    expect(
      plan.candidates.every(
        candidate => !candidate.prompt.includes('Taylor Swift')
      )
    ).toBe(true);
    expect(result.contractVersion).toBe(MERCH_CONCEPT_CONTRACT);
    expect(MERCH_CONCEPT_CRITERIA).toHaveLength(7);
  });
});
