import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingRecipeBody } from '@/components/organisms/PricingRecipeBody';
import { PublicPageErrorFallback } from '@/components/providers/PublicPageErrorFallback';
import {
  auditRenderedCopyCertification,
  auditRenderedMarketingCopy,
  createMarketingCopyReviewDigest,
  createRenderedCopyCertification,
  createRenderedCopyDigest,
  MARKETING_COPY_REVIEW_ROLES,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
  type MarketingCopyPanelReview,
  type RenderedCopyLine,
  type RenderedCopySection,
  type RenderedCopySurface,
} from '@/data/marketing';
import {
  pricingPageCopyBrief,
  pricingPageReviewedDraft,
  publicErrorFallbackCopyBrief,
  publicErrorFallbackReviewedDraft,
  RENDERED_COPY_COVERAGE_INVENTORY,
} from '@/data/marketing/renderedCopyCoverage';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

vi.mock('@/components/features/landing/LandingCTAButton', () => ({
  LandingCTAButton: ({ label }: Readonly<{ label: string }>) => (
    <button type='button'>{label}</button>
  ),
}));

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <div data-testid='home-trust-section' />,
}));

vi.mock('@/lib/errors/capture', () => ({
  captureErrorInSentry: vi.fn(),
}));

const SOURCE_VERSION = 'test-source-version';

function textOf(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? '';
}

function renderedLine(
  lineId: string,
  role: RenderedCopyLine['role'],
  value: string
): RenderedCopyLine {
  return { lineId, role, value };
}

function planCardSection(
  container: ParentNode,
  sectionId: string,
  planId: string
): RenderedCopySection {
  const card = container.querySelector(
    `[data-testid="marketing-pricing-plan-${planId}"]`
  );
  expect(card).not.toBeNull();
  const lines: RenderedCopyLine[] = [
    renderedLine(
      'headline',
      'headline',
      textOf(card as Element, '.marketing-pricing-plan-card__name')
    ),
    renderedLine(
      'body',
      'body',
      textOf(card as Element, '.marketing-pricing-plan-card__body')
    ),
    renderedLine(
      'supporting:0',
      'supporting',
      textOf(card as Element, '.marketing-pricing-plan-card__badge')
    ),
    renderedLine(
      'supporting:1',
      'supporting',
      textOf(card as Element, '.marketing-pricing-plan-card__price')
    ),
    renderedLine(
      'supporting:2',
      'supporting',
      textOf(card as Element, '.marketing-pricing-plan-card__cta')
    ),
  ];
  const features = [
    ...(card as Element).querySelectorAll(
      '.marketing-pricing-plan-card__features li span'
    ),
  ].map(element => element.textContent?.trim() ?? '');
  for (const [index, feature] of features.entries()) {
    lines.push(renderedLine(`supporting:${3 + index}`, 'supporting', feature));
  }
  return { sectionId, lines };
}

function pricingRenderedSurface(): RenderedCopySurface {
  const proClaim = getPublicPriceClaim('pro');
  const { container } = render(
    <PricingRecipeBody
      requestAccessCopy={`Artist Visibility Pro is ${proClaim.priceLabel}/month with limited access. Request access.`}
      plans={
        <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
      }
      comparisonChart={<div data-testid='pricing-comparison-chart' />}
    />
  );
  const heroCtas = [
    ...container.querySelectorAll('.marketing-hero-actions a'),
  ].map(element => element.textContent?.trim() ?? '');
  const finalCtas = [
    ...container.querySelectorAll('.system-b-pricing-actions a'),
  ].map(element => element.textContent?.trim() ?? '');
  return {
    surfaceId: 'pricing-page',
    pageId: 'pricing',
    route: '/pricing',
    state: 'default',
    sourceVersion: SOURCE_VERSION,
    sections: [
      {
        sectionId: 'hero',
        lines: [
          renderedLine(
            'headline',
            'headline',
            textOf(container, '#pricing-hero-heading')
          ),
          renderedLine(
            'body',
            'body',
            textOf(container, '.marketing-hero-subtitle')
          ),
          renderedLine('supporting:0', 'supporting', heroCtas[0] ?? ''),
          renderedLine('supporting:1', 'supporting', heroCtas[1] ?? ''),
          renderedLine(
            'supporting:2',
            'supporting',
            textOf(container, '.system-b-pricing-story-label')
          ),
          renderedLine(
            'supporting:3',
            'supporting',
            textOf(container, '.system-b-pricing-story-title')
          ),
          renderedLine(
            'supporting:4',
            'supporting',
            textOf(container, '.system-b-pricing-story-body')
          ),
        ],
      },
      planCardSection(container, 'plan-free', 'free'),
      planCardSection(container, 'plan-pro', 'pro'),
      planCardSection(container, 'plan-enterprise', 'enterprise'),
      {
        sectionId: 'compare',
        lines: [
          renderedLine(
            'headline',
            'headline',
            textOf(container, '#pricing-compare-heading')
          ),
          renderedLine(
            'body',
            'body',
            textOf(container, '.system-b-pricing-section-body')
          ),
        ],
      },
      {
        sectionId: 'final',
        lines: [
          renderedLine(
            'headline',
            'headline',
            textOf(container, '#pricing-get-started-heading')
          ),
          renderedLine(
            'body',
            'body',
            textOf(container, '.system-b-pricing-final-copy')
          ),
          renderedLine('supporting:0', 'supporting', finalCtas[0] ?? ''),
          renderedLine('supporting:1', 'supporting', finalCtas[1] ?? ''),
          renderedLine('supporting:2', 'supporting', finalCtas[2] ?? ''),
        ],
      },
    ],
  };
}

function errorFallbackRenderedSurface(): RenderedCopySurface {
  const { container } = render(
    <PublicPageErrorFallback
      error={new Error('boom')}
      context='copy-rendered-verification-test'
      onRefresh={() => {}}
    />
  );
  return {
    surfaceId: 'public-error-fallback',
    pageId: 'public-error-fallback',
    route: 'state:public-error-fallback',
    state: 'error',
    sourceVersion: SOURCE_VERSION,
    sections: [
      {
        sectionId: 'error-fallback',
        lines: [
          renderedLine(
            'headline',
            'headline',
            textOf(container, '.system-b-error-fallback__title')
          ),
          renderedLine(
            'body',
            'body',
            textOf(container, '.system-b-error-fallback__description')
          ),
          renderedLine(
            'supporting:0',
            'supporting',
            textOf(container, '.system-b-error-fallback__actions button')
          ),
        ],
      },
    ],
  };
}

function panelReviews(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft
): MarketingCopyPanelReview[] {
  const digest = createMarketingCopyReviewDigest(brief, draft);
  const candidateIds = draft.sections.map(section => section.candidateId);
  const claimIds = draft.sections.flatMap(section => section.claimIds);
  return MARKETING_COPY_REVIEW_ROLES.map((role, index) => ({
    reviewerId: `rendered-${role}`,
    provider: index < 2 ? 'openai' : 'anthropic',
    model: index < 2 ? 'gpt-5' : 'claude-sonnet',
    executionId: `rendered-run-${role}`,
    role,
    verdict: 'pass' as const,
    notes: [`Reviewed the ${role} contract against rendered copy.`],
    reviewedSectionIds: draft.sections.map(section => section.sectionId),
    reviewedCandidateIds: candidateIds,
    reviewedClaimIds: role === 'truth' ? claimIds : undefined,
    reviewDigest: digest,
  }));
}

function mutateLine(
  surface: RenderedCopySurface,
  sectionId: string,
  lineId: string,
  value: string
): RenderedCopySurface {
  return {
    ...surface,
    sections: surface.sections.map(section =>
      section.sectionId === sectionId
        ? {
            ...section,
            lines: section.lines.map(line =>
              line.lineId === lineId ? { ...line, value } : line
            ),
          }
        : section
    ),
  };
}

describe('rendered copy coverage inventory', () => {
  it('covers the pilot pricing route and the public error state', () => {
    expect(
      RENDERED_COPY_COVERAGE_INVENTORY.map(entry => entry.surfaceId)
    ).toEqual(['pricing-page', 'public-error-fallback']);
  });
});

describe('rendered marketing copy audit — /pricing', () => {
  const brief = pricingPageCopyBrief();
  const draft = pricingPageReviewedDraft();

  it('passes when the mounted route renders the reviewed words', () => {
    expect(
      auditRenderedMarketingCopy(brief, draft, pricingRenderedSurface())
    ).toEqual([]);
  });

  it('fails a registry-pass when rendered words differ from the reviewed copy', () => {
    const surface = mutateLine(
      pricingRenderedSurface(),
      'plan-pro',
      'supporting:1',
      '$149/mo'
    );
    const issues = auditRenderedMarketingCopy(brief, draft, surface);
    const codes = issues.map(issue => issue.code);
    expect(codes).toContain('rendered-text-mismatch');
    expect(codes).toContain('unsupported-rendered-claim');
  });

  it('detects invented success claims the registry cannot support', () => {
    const surface = mutateLine(
      pricingRenderedSurface(),
      'compare',
      'body',
      'Trusted by 10,000 artists.'
    );
    const issues = auditRenderedMarketingCopy(brief, draft, surface);
    expect(issues.map(issue => issue.code)).toContain(
      'unsupported-rendered-claim'
    );
  });

  it('flags rendered lines the draft never reviewed', () => {
    const surface = pricingRenderedSurface();
    const hero = surface.sections[0];
    const augmented: RenderedCopySurface = {
      ...surface,
      sections: [
        {
          ...hero,
          lines: [
            ...hero.lines,
            renderedLine('supporting:9', 'supporting', 'No credit card needed'),
          ],
        },
        ...surface.sections.slice(1),
      ],
    };
    const issues = auditRenderedMarketingCopy(brief, draft, augmented);
    const codes = issues.map(issue => issue.code);
    expect(codes).toContain('unbound-rendered-line');
    expect(codes).toContain('unsupported-rendered-claim');
  });

  it('lets an approved exception survive a deliberate rendered divergence', () => {
    const surface = mutateLine(
      pricingRenderedSurface(),
      'hero',
      'supporting:2',
      'Artist profile'
    );
    const issues = auditRenderedMarketingCopy(brief, draft, surface, {
      exceptions: [
        {
          sectionId: 'hero',
          lineId: 'supporting:2',
          value: 'Artist profile',
          approvedBy: 'tim',
          reference: 'JOV-6478-taste-1',
        },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('still rejects an unsupported claim even when the words were excepted', () => {
    const surface = mutateLine(
      pricingRenderedSurface(),
      'plan-pro',
      'supporting:1',
      '$99/mo'
    );
    const issues = auditRenderedMarketingCopy(brief, draft, surface, {
      exceptions: [
        {
          sectionId: 'plan-pro',
          lineId: 'supporting:1',
          value: '$99/mo',
          approvedBy: 'tim',
          reference: 'JOV-6478-taste-2',
        },
      ],
    });
    expect(issues.map(issue => issue.code)).toContain(
      'unsupported-rendered-claim'
    );
  });

  it('flags stale exceptions that no longer resolve to a rendered line', () => {
    const issues = auditRenderedMarketingCopy(
      brief,
      draft,
      pricingRenderedSurface(),
      {
        exceptions: [
          {
            sectionId: 'hero',
            lineId: 'supporting:7',
            value: 'Gone line',
            approvedBy: 'tim',
            reference: 'JOV-6478-taste-3',
          },
        ],
      }
    );
    expect(issues.map(issue => issue.code)).toContain(
      'stale-approved-exception'
    );
  });
});

describe('rendered marketing copy audit — public error fallback', () => {
  const brief = publicErrorFallbackCopyBrief();
  const draft = publicErrorFallbackReviewedDraft();

  it('passes when the mounted fallback renders the reviewed recovery copy', () => {
    expect(
      auditRenderedMarketingCopy(brief, draft, errorFallbackRenderedSurface())
    ).toEqual([]);
  });

  it('fails when the recovery action is bound but not rendered', () => {
    const surface = errorFallbackRenderedSurface();
    const section = surface.sections[0];
    const withoutAction: RenderedCopySurface = {
      ...surface,
      sections: [
        {
          ...section,
          lines: section.lines.filter(line => line.lineId !== 'supporting:0'),
        },
      ],
    };
    const issues = auditRenderedMarketingCopy(brief, draft, withoutAction);
    const codes = issues.map(issue => issue.code);
    expect(codes).toContain('missing-rendered-line');
    expect(codes).toContain('missing-recovery-action');
  });

  it('fails an error-facing section that renders no bound action at all', () => {
    const unboundDraft: MarketingCopyPageDraft = {
      ...draft,
      sections: [
        {
          ...draft.sections[0],
          lineBindings: [
            {
              lineId: 'headline',
              role: 'headline' as const,
              outcomeId: 'acknowledge-failure',
            },
            {
              lineId: 'body',
              role: 'body' as const,
              claimIds: ['error-disclosure'],
            },
            {
              lineId: 'supporting:0',
              role: 'supporting' as const,
              claimIds: ['error-disclosure'],
            },
          ],
        },
      ],
    };
    const issues = auditRenderedMarketingCopy(
      brief,
      unboundDraft,
      errorFallbackRenderedSurface()
    );
    expect(issues.map(issue => issue.code)).toContain(
      'missing-recovery-action'
    );
  });
});

describe('rendered copy certification', () => {
  it('certifies the pricing surface only after every layer passes', () => {
    const brief = pricingPageCopyBrief();
    const draft = pricingPageReviewedDraft();
    const certification = createRenderedCopyCertification({
      brief,
      draft,
      surface: pricingRenderedSurface(),
      reviews: panelReviews(brief, draft),
      certifiedAt: '2026-09-26T08:00:00.000Z',
    });
    expect(certification.kind).toBe('rendered-marketing-copy');
    expect(certification.route).toBe('/pricing');
    expect(certification.reviewDigest).toBe(
      createMarketingCopyReviewDigest(brief, draft)
    );
    expect(certification.reviews).toHaveLength(4);
    expect(
      auditRenderedCopyCertification(certification, {
        brief,
        draft,
        surface: pricingRenderedSurface(),
      })
    ).toEqual([]);
  });

  it('refuses to certify a registry pass whose rendered words differ', () => {
    const brief = pricingPageCopyBrief();
    const draft = pricingPageReviewedDraft();
    const surface = mutateLine(
      pricingRenderedSurface(),
      'final',
      'supporting:0',
      'Start free trial'
    );
    expect(() =>
      createRenderedCopyCertification({
        brief,
        draft,
        surface,
        reviews: panelReviews(brief, draft),
        certifiedAt: '2026-09-26T08:00:00.000Z',
      })
    ).toThrow(/rendered-text-mismatch/);
  });

  it('marks a certification stale when rendered output changes afterwards', () => {
    const brief = pricingPageCopyBrief();
    const draft = pricingPageReviewedDraft();
    const certification = createRenderedCopyCertification({
      brief,
      draft,
      surface: pricingRenderedSurface(),
      reviews: panelReviews(brief, draft),
      certifiedAt: '2026-09-26T08:00:00.000Z',
    });
    const drifted = mutateLine(
      pricingRenderedSurface(),
      'plan-free',
      'supporting:0',
      'Free for a year'
    );
    const codes = auditRenderedCopyCertification(certification, {
      brief,
      draft,
      surface: drifted,
    }).map(issue => issue.code);
    expect(codes).toContain('stale-rendered-copy');
  });

  it('marks a certification stale when the reviewed draft changes afterwards', () => {
    const brief = pricingPageCopyBrief();
    const draft = pricingPageReviewedDraft();
    const surface = pricingRenderedSurface();
    const certification = createRenderedCopyCertification({
      brief,
      draft,
      surface,
      reviews: panelReviews(brief, draft),
      certifiedAt: '2026-09-26T08:00:00.000Z',
    });
    const revisedDraft: MarketingCopyPageDraft = {
      ...draft,
      sections: draft.sections.map(section =>
        section.sectionId === 'compare'
          ? { ...section, headline: 'Compare Every Feature' }
          : section
      ),
    };
    const codes = auditRenderedCopyCertification(certification, {
      brief,
      draft: revisedDraft,
      surface,
    }).map(issue => issue.code);
    expect(codes).toContain('stale-review-digest');
  });

  it('marks a certification stale when the deployed source version changes', () => {
    const brief = pricingPageCopyBrief();
    const draft = pricingPageReviewedDraft();
    const certification = createRenderedCopyCertification({
      brief,
      draft,
      surface: pricingRenderedSurface(),
      reviews: panelReviews(brief, draft),
      certifiedAt: '2026-09-26T08:00:00.000Z',
    });
    const redeployed: RenderedCopySurface = {
      ...pricingRenderedSurface(),
      sourceVersion: 'a-different-deploy',
    };
    const codes = auditRenderedCopyCertification(certification, {
      brief,
      draft,
      surface: redeployed,
    }).map(issue => issue.code);
    expect(codes).toContain('stale-source-version');
    expect(codes).toContain('stale-rendered-copy');
  });

  it('fingerprints the exact rendered text at a source version', () => {
    const first = createRenderedCopyDigest(pricingRenderedSurface());
    const second = createRenderedCopyDigest(
      mutateLine(pricingRenderedSurface(), 'hero', 'headline', 'Plans')
    );
    expect(first).toMatch(/^rendered-copy\/1\.1\.0\/sha256\/[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it('certifies the error fallback surface with the same chain', () => {
    const brief = publicErrorFallbackCopyBrief();
    const draft = publicErrorFallbackReviewedDraft();
    const certification = createRenderedCopyCertification({
      brief,
      draft,
      surface: errorFallbackRenderedSurface(),
      reviews: panelReviews(brief, draft),
      certifiedAt: '2026-09-26T08:00:00.000Z',
    });
    expect(certification.state).toBe('error');
    expect(
      auditRenderedCopyCertification(certification, {
        brief,
        draft,
        surface: errorFallbackRenderedSurface(),
      })
    ).toEqual([]);
  });
});
