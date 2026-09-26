import { describe, expect, it } from 'vitest';
import {
  auditMarketingCopyRendered,
  auditMarketingCopyRenderedCertification,
  auditMarketingCopySemantics,
  certifyMarketingCopyRendered,
  createMarketingCopyRenderedDigest,
  createMarketingCopyReviewDigest,
  MARKETING_COPY_REVIEW_ROLES,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
  type MarketingCopyPanelReview,
  type MarketingCopyRenderedSurface,
} from '@/data/marketing';

// Coverage inventory slice 1: marketing-pricing (writing-surfaces-registry
// surface id "marketing-pricing"). Grounded in offer truth (JOV-5814).
const pricingBrief: MarketingCopyPageBrief = {
  pageId: 'pricing',
  route: '/pricing',
  audience: 'independent artists',
  objective: 'earn a plan selection',
  claims: [
    {
      id: 'pro-price',
      statement: 'Pro is $14 per month.',
      evidence: ['apps/web/lib/billing/offer-truth.ts'],
    },
  ],
  outcomes: [
    {
      id: 'pick-plan',
      statement: 'Pick the plan that fits the release.',
      claimIds: ['pro-price'],
    },
  ],
  actions: [{ id: 'start', statement: 'Start free today.' }],
  sections: [
    {
      sectionId: 'plans',
      storyBeat: 'offer',
      sectionJob: 'name the plan price',
      customerOutcome: 'the artist picks a plan',
      messageSubject: 'pro plan',
      visualEvidence: 'the plan cards',
      allowedClaimIds: ['pro-price'],
      headlineWordLimit: 8,
      headlineSignals: [['pro', 'plan']],
    },
  ],
};

const pricingDraft: MarketingCopyPageDraft = {
  pageId: pricingBrief.pageId,
  route: pricingBrief.route,
  sections: [
    {
      sectionId: 'plans',
      candidateId: 'plans-v1',
      control: { headline: 'Plans for every release.' },
      headline: 'Pro is $14 a month.',
      claimIds: ['pro-price'],
      lineBindings: [
        {
          lineId: 'headline',
          role: 'headline',
          outcomeId: 'pick-plan',
          claimIds: ['pro-price'],
        },
      ],
      meaningTrace: 'The headline names the real Pro price.',
      tasteTags: ['direct', 'specific'],
    },
  ],
};

function renderedPricing(
  headline = 'Pro is $14 a month.'
): MarketingCopyRenderedSurface {
  return {
    pageId: 'pricing',
    route: '/pricing',
    sourceVersion: '107b5408301a5f3304c875a6e453221ba3742b29',
    capturedAt: '2026-09-26T09:30:00.000Z',
    sections: [
      {
        sectionId: 'plans',
        lines: [{ lineId: 'headline', role: 'headline', text: headline }],
      },
    ],
  };
}

// Coverage inventory slice 2: product-ui-errors-onboarding — the scripted
// onboarding stream_error state (apps/web/lib/chat/onboarding-script).
const errorBrief: MarketingCopyPageBrief = {
  pageId: 'onboarding-stream-error',
  route: '/onboarding',
  audience: 'onboarding artists',
  objective: 'resume the interrupted onboarding chat',
  claims: [
    {
      id: 'resume',
      statement: 'The onboarding chat can resume after an interruption.',
      evidence: ['apps/web/lib/chat/onboarding-script/script.ts'],
    },
  ],
  outcomes: [
    {
      id: 'resume-chat',
      statement: 'The artist resumes the chat after a dropped connection.',
      claimIds: ['resume'],
    },
  ],
  actions: [{ id: 'retry', statement: 'Say that again and we pick it up.' }],
  sections: [
    {
      sectionId: 'stream-error',
      storyBeat: 'recovery',
      sectionJob: 'explain the interruption and the next step',
      customerOutcome: 'the artist knows how to continue',
      messageSubject: 'the interrupted chat',
      visualEvidence: 'the stalled chat thread',
      allowedClaimIds: ['resume'],
      headlineWordLimit: 14,
      headlineSignals: [['thread', 'again', 'lost']],
    },
  ],
};

const errorDraft: MarketingCopyPageDraft = {
  pageId: errorBrief.pageId,
  route: errorBrief.route,
  sections: [
    {
      sectionId: 'stream-error',
      candidateId: 'stream-error-v1',
      control: { headline: 'Something went wrong.' },
      headline:
        'Lost the thread mid-sentence. Say that again and we pick it up.',
      claimIds: ['resume'],
      lineBindings: [
        {
          lineId: 'headline',
          role: 'headline',
          outcomeId: 'resume-chat',
          actionId: 'retry',
        },
      ],
      meaningTrace: 'The line names the interruption and the recovery step.',
      tasteTags: ['direct', 'plain'],
    },
  ],
};

function renderedError(
  headline = 'Lost the thread mid-sentence. Say that again and we pick it up.'
): MarketingCopyRenderedSurface {
  return {
    pageId: 'onboarding-stream-error',
    route: '/onboarding',
    stateId: 'stream_error',
    sourceVersion: '107b5408301a5f3304c875a6e453221ba3742b29',
    sections: [
      {
        sectionId: 'stream-error',
        requiresRecoveryAction: true,
        lines: [{ lineId: 'headline', role: 'headline', text: headline }],
      },
    ],
  };
}

function panelReviews(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  sectionId: string,
  candidateId: string,
  claimIds: readonly string[]
): MarketingCopyPanelReview[] {
  const digest = createMarketingCopyReviewDigest(brief, draft);
  return MARKETING_COPY_REVIEW_ROLES.map((role, index) => ({
    reviewerId: `reviewer-${role}`,
    provider: index < 2 ? 'openai' : 'anthropic',
    model: index < 2 ? 'gpt-5' : 'claude-sonnet',
    executionId: `run-${role}`,
    role,
    verdict: 'pass' as const,
    notes: [`Reviewed the ${role} contract.`],
    reviewedSectionIds: [sectionId],
    reviewedCandidateIds: [candidateId],
    reviewedClaimIds: role === 'truth' ? [...claimIds] : undefined,
    reviewDigest: digest,
  }));
}

describe('rendered marketing copy verification (JOV-6478)', () => {
  it('certifies a pricing route whose rendered text matches the draft', () => {
    expect(
      auditMarketingCopyRendered(pricingBrief, pricingDraft, renderedPricing())
    ).toEqual([]);
    const certification = certifyMarketingCopyRendered({
      brief: pricingBrief,
      draft: pricingDraft,
      rendered: renderedPricing(),
      reviews: panelReviews(pricingBrief, pricingDraft, 'plans', 'plans-v1', [
        'pro-price',
      ]),
      certifiedAt: '2026-09-26T10:00:00.000Z',
    });
    expect(certification.renderedDigest).toMatch(
      /^marketing-copy-rendered\/1\.1\.0\/sha256\/[a-f0-9]{64}$/
    );
    expect(
      auditMarketingCopyRenderedCertification(
        certification,
        pricingBrief,
        pricingDraft,
        renderedPricing()
      )
    ).toEqual([]);
  });

  it('fails a registry-pass draft that renders different words', () => {
    expect(
      auditMarketingCopySemantics(pricingBrief, pricingDraft, {
        enforcement: 'delta',
      }).status
    ).toBe('pass');
    const issues = auditMarketingCopyRendered(
      pricingBrief,
      pricingDraft,
      renderedPricing('Pricing that works for every artist.')
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'rendered-text-changed',
          lineId: 'headline',
        }),
      ])
    );
    expect(() =>
      certifyMarketingCopyRendered({
        brief: pricingBrief,
        draft: pricingDraft,
        rendered: renderedPricing('Pricing that works for every artist.'),
        reviews: panelReviews(pricingBrief, pricingDraft, 'plans', 'plans-v1', [
          'pro-price',
        ]),
        certifiedAt: '2026-09-26T10:00:00.000Z',
      })
    ).toThrow(/rendered-text-changed/);
  });

  it('fails rendered output asserting unsupported pricing', () => {
    const issues = auditMarketingCopyRendered(
      pricingBrief,
      pricingDraft,
      renderedPricing('Pro is $49 a month.')
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-rendered-claim' }),
      ])
    );
  });

  it('fails rendered output inventing success the claims never attested', () => {
    const issues = auditMarketingCopyRendered(
      pricingBrief,
      pricingDraft,
      renderedPricing('The #1 plan for artists.')
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invented-success' }),
      ])
    );
  });

  it('flags rendered sections and lines the draft never certified', () => {
    const surface = renderedPricing();
    const issues = auditMarketingCopyRendered(pricingBrief, pricingDraft, {
      ...surface,
      sections: [
        {
          sectionId: 'plans',
          lines: [
            ...surface.sections[0].lines,
            { lineId: 'fine-print', role: 'supporting', text: 'Terms apply.' },
          ],
        },
        { sectionId: 'faq', lines: [] },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unbound-rendered-line' }),
        expect.objectContaining({ code: 'unbriefed-rendered-section' }),
      ])
    );
  });

  it('invalidates certification when the rendered text or brief changes', () => {
    const certification = certifyMarketingCopyRendered({
      brief: pricingBrief,
      draft: pricingDraft,
      rendered: renderedPricing(),
      reviews: panelReviews(pricingBrief, pricingDraft, 'plans', 'plans-v1', [
        'pro-price',
      ]),
      certifiedAt: '2026-09-26T10:00:00.000Z',
    });
    expect(
      auditMarketingCopyRenderedCertification(
        certification,
        pricingBrief,
        pricingDraft,
        renderedPricing('Pro is $14 per month.')
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'stale-rendered-digest' }),
      ])
    );
    const revisedBrief: MarketingCopyPageBrief = {
      ...pricingBrief,
      claims: [
        { ...pricingBrief.claims[0], statement: 'Pro is $16 per month.' },
      ],
    };
    expect(
      auditMarketingCopyRenderedCertification(
        certification,
        revisedBrief,
        pricingDraft,
        renderedPricing()
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'stale-review-digest' }),
        expect.objectContaining({ code: 'stale-rendered-digest' }),
      ])
    );
    expect(
      auditMarketingCopyRenderedCertification(
        certification,
        pricingBrief,
        pricingDraft,
        { ...renderedPricing(), sourceVersion: 'deadbeef' }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'certification-surface-mismatch' }),
      ])
    );
  });

  it('lets an approved exception survive and flags stale or invalid ones', () => {
    const changed = renderedPricing('Pricing that works for every artist.');
    const exception = {
      code: 'rendered-text-changed',
      sectionId: 'plans',
      lineId: 'headline',
      reason: 'Founder-approved terse label experiment.',
      approvedBy: 'tim',
      approvedAt: '2026-09-26T10:00:00.000Z',
    };
    expect(
      auditMarketingCopyRendered(pricingBrief, pricingDraft, changed, {
        exceptions: [exception],
      })
    ).toEqual([]);
    expect(
      auditMarketingCopyRendered(
        pricingBrief,
        pricingDraft,
        renderedPricing(),
        {
          exceptions: [exception],
        }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'stale-rendered-exception' }),
      ])
    );
    expect(
      auditMarketingCopyRendered(pricingBrief, pricingDraft, changed, {
        exceptions: [{ ...exception, reason: '' }],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-rendered-exception' }),
        expect.objectContaining({ code: 'rendered-text-changed' }),
      ])
    );
  });

  it('digests bind the exact rendered text at the recorded source version', () => {
    const first = createMarketingCopyRenderedDigest(
      pricingBrief,
      pricingDraft,
      renderedPricing()
    );
    const second = createMarketingCopyRenderedDigest(
      pricingBrief,
      pricingDraft,
      renderedPricing('Pro is $14 per month.')
    );
    expect(first).not.toBe(second);
  });
});

describe('rendered UI error state verification (JOV-6478)', () => {
  it('passes the scripted onboarding stream_error line with its recovery action', () => {
    expect(
      auditMarketingCopyRendered(errorBrief, errorDraft, renderedError())
    ).toEqual([]);
  });

  it('fails an error state that renders no concrete recovery action', () => {
    const draftWithoutAction: MarketingCopyPageDraft = {
      ...errorDraft,
      sections: [
        {
          ...errorDraft.sections[0],
          lineBindings: [
            {
              lineId: 'headline',
              role: 'headline',
              outcomeId: 'resume-chat',
            },
          ],
        },
      ],
    };
    const issues = auditMarketingCopyRendered(
      errorBrief,
      draftWithoutAction,
      renderedError()
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-recovery-action' }),
      ])
    );
  });

  it('fails when the rendered error copy omits the certified line', () => {
    const issues = auditMarketingCopyRendered(errorBrief, errorDraft, {
      ...renderedError(),
      sections: [
        {
          sectionId: 'stream-error',
          requiresRecoveryAction: true,
          lines: [],
        },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-rendered-line' }),
        expect.objectContaining({ code: 'missing-recovery-action' }),
      ])
    );
  });
});
