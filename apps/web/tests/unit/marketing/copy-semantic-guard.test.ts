import { describe, expect, it } from 'vitest';
import {
  auditMarketingCopySemantics,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
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
  instructionTokens: {
    process: ['concise', 'compress'],
    style: ['premium', 'adaptive'],
    audience: ['artist', 'artists'],
    productCategory: ['profile', 'profiles'],
  },
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

function draft(
  headline: string,
  lineBindings = [
    { lineId: 'headline', role: 'headline' as const, outcomeId: 'one-profile' },
  ]
): MarketingCopyPageDraft {
  return {
    pageId: brief.pageId,
    route: brief.route,
    sections: [
      {
        sectionId: 'hero',
        candidateId: 'hero-v1',
        control: { headline: 'The link your music deserves.' },
        headline,
        claimIds: ['profile'],
        lineBindings,
        meaningTrace: 'This line names the customer outcome.',
        tasteTags: ['direct'],
      },
    ],
  };
}

describe('meaning-first marketing copy guard', () => {
  it('passes truthful outcome-bound language, including adaptive and premium', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('One adaptive premium profile for every fan')
    );
    expect(result.status).toBe('pass');
  });

  it.each([
    ['meta-copy', 'One concise heading, built for artists.'],
    ['brief-parroting', 'Concise premium adaptive.'],
    ['style-adjective-substitution', 'A premium adaptive profile.'],
    ['audience-product-category-mismatch', 'Built for dashboards.'],
    ['built-for-wrong-noun', 'Built for dashboards.'],
    ['generic-feature-soup', 'AI, analytics, integrations, and workflows.'],
    ['headline-layout-copy', 'A premium heading for the page.'],
  ] as const)('rejects %s', (code, headline) => {
    const result = auditMarketingCopySemantics(brief, draft(headline), {
      enforcement: 'delta',
    });
    expect(result.status).toBe('fail');
    expect(result.issueCounts[code]).toBeGreaterThan(0);
  });

  it('requires every visible line to name an outcome, claim, or action', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('Share one profile everywhere', []),
      { enforcement: 'delta' }
    );
    expect(result.issueCounts['unbound-visible-line']).toBe(1);
    expect(result.blocking).toBe(true);
  });

  it('reports legacy issues without blocking shadow mode', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('Concise premium adaptive.'),
      { enforcement: 'shadow' }
    );
    expect(result.status).toBe('advisory');
    expect(result.blocking).toBe(false);
  });
});
