import { describe, expect, it } from 'vitest';
import {
  applyMarketingCopyTasteDecision,
  auditMarketingCopyPanel,
  createEmptyMarketingCopyTasteProfile,
  createMarketingCopyReviewDigest,
  createMarketingCopyTasteInboxItem,
  MARKETING_COPY_REVIEW_ROLES,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
  type MarketingCopyPanelReview,
} from '@/data/marketing';

const brief: MarketingCopyPageBrief = {
  pageId: 'artist-profiles',
  route: '/artist-profiles',
  audience: 'independent artists',
  objective: 'earn a profile claim',
  claims: [
    {
      id: 'profile',
      statement: 'One profile can be shared everywhere.',
      evidence: ['route'],
    },
  ],
  outcomes: [
    {
      id: 'one-profile',
      statement: 'Share one profile across every fan moment.',
      claimIds: ['profile'],
    },
  ],
  actions: [{ id: 'claim', statement: 'Claim the profile.' }],
  sections: [
    {
      sectionId: 'hero',
      storyBeat: 'promise',
      sectionJob: 'name the product outcome',
      customerOutcome: 'the artist gets one durable destination',
      messageSubject: 'profile',
      visualEvidence: 'a live profile',
      allowedClaimIds: ['profile'],
      headlineWordLimit: 8,
      headlineSignals: [['profile']],
    },
  ],
};

const draft: MarketingCopyPageDraft = {
  pageId: brief.pageId,
  route: brief.route,
  sections: [
    {
      sectionId: 'hero',
      candidateId: 'hero-v1',
      control: { headline: 'The link your music deserves.' },
      headline: 'One profile for every fan',
      claimIds: ['profile'],
      lineBindings: [
        {
          lineId: 'headline',
          role: 'headline',
          outcomeId: 'one-profile',
        },
      ],
      meaningTrace: 'The profile gives each fan one useful destination.',
      tasteTags: ['direct', 'specific'],
    },
  ],
};

function panelReviews(): MarketingCopyPanelReview[] {
  const digest = createMarketingCopyReviewDigest(brief, draft);
  return MARKETING_COPY_REVIEW_ROLES.map((role, index) => ({
    reviewerId: `reviewer-${role}`,
    provider: index < 2 ? 'openai' : 'anthropic',
    model: index < 2 ? 'gpt-5' : 'claude-sonnet',
    executionId: `run-${role}`,
    role,
    verdict: 'pass' as const,
    notes: [`Reviewed the ${role} contract.`],
    reviewedSectionIds: ['hero'],
    reviewedCandidateIds: ['hero-v1'],
    reviewedClaimIds: role === 'truth' ? ['profile'] : undefined,
    reviewDigest: digest,
  }));
}

describe('marketing copy adversarial panel and taste inbox', () => {
  it('requires every independent panel role and a current digest', () => {
    expect(auditMarketingCopyPanel([], brief, draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-panel-role' }),
      ])
    );
    expect(auditMarketingCopyPanel(panelReviews(), brief, draft)).toEqual([]);
  });

  it('creates a human taste inbox item only after semantic and panel review pass', () => {
    const item = createMarketingCopyTasteInboxItem({
      brief,
      draft,
      reviews: panelReviews(),
      createdAt: '2026-08-04T20:00:00.000Z',
    });
    expect(item.queue).toBe('tim-taste');
    expect(item.status).toBe('needs-human-taste');
    expect(item.sections[0]?.candidate.candidateId).toBe('hero-v1');
  });

  it('turns an approved taste decision into reusable signals with a receipt', () => {
    const item = createMarketingCopyTasteInboxItem({
      brief,
      draft,
      reviews: panelReviews(),
      createdAt: '2026-08-04T20:00:00.000Z',
    });
    const next = applyMarketingCopyTasteDecision(
      createEmptyMarketingCopyTasteProfile(),
      item,
      {
        decisionId: 'artist-profiles-hero-1',
        reviewer: 'tim',
        decidedAt: '2026-08-04T20:01:00.000Z',
        sections: [
          {
            sectionId: 'hero',
            candidateId: 'hero-v1',
            outcome: 'approved',
          },
        ],
      }
    );
    expect(next.appliedDecisionIds).toEqual(['artist-profiles-hero-1']);
    expect(next.signals.direct.approved).toBe(1);
    expect(next.signals.specific.approved).toBe(1);
  });

  it('rejects a duplicate decision receipt instead of double-counting taste', () => {
    const item = createMarketingCopyTasteInboxItem({
      brief,
      draft,
      reviews: panelReviews(),
      createdAt: '2026-08-04T20:00:00.000Z',
    });
    const profile = applyMarketingCopyTasteDecision(
      createEmptyMarketingCopyTasteProfile(),
      item,
      {
        decisionId: 'artist-profiles-hero-1',
        reviewer: 'tim',
        decidedAt: '2026-08-04T20:01:00.000Z',
        sections: [
          {
            sectionId: 'hero',
            candidateId: 'hero-v1',
            outcome: 'rejected',
          },
        ],
      }
    );
    expect(() =>
      applyMarketingCopyTasteDecision(profile, item, {
        decisionId: 'artist-profiles-hero-1',
        reviewer: 'tim',
        decidedAt: '2026-08-04T20:02:00.000Z',
        sections: [
          {
            sectionId: 'hero',
            candidateId: 'hero-v1',
            outcome: 'approved',
          },
        ],
      })
    ).toThrow(/already been applied/);
  });
});
