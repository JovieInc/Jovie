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
  type RenderedCopyAuditOptions,
  type RenderedCopyLine,
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
const CERTIFIED_AT = '2026-09-26T08:00:00.000Z';

const textOf = (root: ParentNode, selector: string): string =>
  root.querySelector(selector)?.textContent?.trim() ?? '';

const roleOf = (lineId: string): RenderedCopyLine['role'] =>
  lineId === 'headline'
    ? 'headline'
    : lineId === 'body'
      ? 'body'
      : 'supporting';

const renderedLine = (lineId: string, value: string): RenderedCopyLine => ({
  lineId,
  role: roleOf(lineId),
  value,
});

/** `[lineId, selector]` rows → rendered lines scraped from the mounted DOM. */
function scrapedLines(
  root: ParentNode,
  entries: readonly (readonly [string, string])[]
): RenderedCopyLine[] {
  return entries.map(([lineId, selector]) =>
    renderedLine(lineId, textOf(root, selector))
  );
}

function planCardSection(
  container: ParentNode,
  sectionId: string,
  planId: string
) {
  const card = container.querySelector(
    `[data-testid="marketing-pricing-plan-${planId}"]`
  );
  expect(card).not.toBeNull();
  const element = card as Element;
  const lines = scrapedLines(element, [
    ['headline', '.marketing-pricing-plan-card__name'],
    ['body', '.marketing-pricing-plan-card__body'],
    ['supporting:0', '.marketing-pricing-plan-card__badge'],
    ['supporting:1', '.marketing-pricing-plan-card__price'],
    ['supporting:2', '.marketing-pricing-plan-card__cta'],
  ]);
  const features = [
    ...element.querySelectorAll(
      '.marketing-pricing-plan-card__features li span'
    ),
  ].map(node => node.textContent?.trim() ?? '');
  for (const [index, feature] of features.entries()) {
    lines.push(renderedLine(`supporting:${3 + index}`, feature));
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
  const linkText = (selector: string): string[] =>
    [...container.querySelectorAll(selector)].map(
      element => element.textContent?.trim() ?? ''
    );
  const heroCtas = linkText('.marketing-hero-actions a');
  const finalCtas = linkText('.system-b-pricing-actions a');
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
          ...scrapedLines(container, [
            ['headline', '#pricing-hero-heading'],
            ['body', '.marketing-hero-subtitle'],
            ['supporting:2', '.system-b-pricing-story-label'],
            ['supporting:3', '.system-b-pricing-story-title'],
            ['supporting:4', '.system-b-pricing-story-body'],
          ]),
          renderedLine('supporting:0', heroCtas[0] ?? ''),
          renderedLine('supporting:1', heroCtas[1] ?? ''),
        ],
      },
      planCardSection(container, 'plan-free', 'free'),
      planCardSection(container, 'plan-pro', 'pro'),
      planCardSection(container, 'plan-enterprise', 'enterprise'),
      {
        sectionId: 'compare',
        lines: scrapedLines(container, [
          ['headline', '#pricing-compare-heading'],
          ['body', '.system-b-pricing-section-body'],
        ]),
      },
      {
        sectionId: 'final',
        lines: [
          ...scrapedLines(container, [
            ['headline', '#pricing-get-started-heading'],
            ['body', '.system-b-pricing-final-copy'],
          ]),
          renderedLine('supporting:0', finalCtas[0] ?? ''),
          renderedLine('supporting:1', finalCtas[1] ?? ''),
          renderedLine('supporting:2', finalCtas[2] ?? ''),
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
        lines: scrapedLines(container, [
          ['headline', '.system-b-error-fallback__title'],
          ['body', '.system-b-error-fallback__description'],
          ['supporting:0', '.system-b-error-fallback__actions button'],
        ]),
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

const auditCodes = (
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  surface: RenderedCopySurface,
  options?: RenderedCopyAuditOptions
) =>
  auditRenderedMarketingCopy(brief, draft, surface, options).map(
    issue => issue.code
  );

const exception = (sectionId: string, lineId: string, value: string) => ({
  sectionId,
  lineId,
  value,
  approvedBy: 'tim',
  reference: `JOV-6478-taste-${lineId}`,
});

const certify = (
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  surface: RenderedCopySurface
) =>
  createRenderedCopyCertification({
    brief,
    draft,
    surface,
    reviews: panelReviews(brief, draft),
    certifiedAt: CERTIFIED_AT,
  });

describe('rendered marketing copy audit — /pricing', () => {
  const brief = pricingPageCopyBrief();
  const draft = pricingPageReviewedDraft();

  it('covers the pilot pricing route and the public error state', () => {
    expect(
      RENDERED_COPY_COVERAGE_INVENTORY.map(entry => entry.surfaceId)
    ).toEqual(['pricing-page', 'public-error-fallback']);
  });

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
    const codes = auditCodes(brief, draft, surface);
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
    expect(auditCodes(brief, draft, surface)).toContain(
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
            renderedLine('supporting:9', 'No credit card needed'),
          ],
        },
        ...surface.sections.slice(1),
      ],
    };
    const codes = auditCodes(brief, draft, augmented);
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
      exceptions: [exception('hero', 'supporting:2', 'Artist profile')],
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
    const codes = auditCodes(brief, draft, surface, {
      exceptions: [exception('plan-pro', 'supporting:1', '$99/mo')],
    });
    expect(codes).toContain('unsupported-rendered-claim');
  });

  it('flags stale exceptions that no longer resolve to a rendered line', () => {
    const codes = auditCodes(brief, draft, pricingRenderedSurface(), {
      exceptions: [exception('hero', 'supporting:7', 'Gone line')],
    });
    expect(codes).toContain('stale-approved-exception');
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
    const codes = auditCodes(brief, draft, withoutAction);
    expect(codes).toContain('missing-rendered-line');
    expect(codes).toContain('missing-recovery-action');
  });

  it('fails an error-facing section that renders no bound action at all', () => {
    const lineBindings = (
      [
        ['headline', { outcomeId: 'acknowledge-failure' }],
        ['body', { claimIds: ['error-disclosure'] }],
        ['supporting:0', { claimIds: ['error-disclosure'] }],
      ] as const
    ).map(([lineId, ref]) => ({ lineId, role: roleOf(lineId), ...ref }));
    const unboundDraft: MarketingCopyPageDraft = {
      ...draft,
      sections: [{ ...draft.sections[0], lineBindings }],
    };
    const codes = auditCodes(
      brief,
      unboundDraft,
      errorFallbackRenderedSurface()
    );
    expect(codes).toContain('missing-recovery-action');
  });
});

describe('rendered copy certification', () => {
  const brief = pricingPageCopyBrief();
  const draft = pricingPageReviewedDraft();
  const certifiedCodes = (
    certification: ReturnType<typeof certify>,
    input: {
      draft?: MarketingCopyPageDraft;
      surface?: RenderedCopySurface;
    } = {}
  ) =>
    auditRenderedCopyCertification(certification, {
      brief,
      draft: input.draft ?? draft,
      surface: input.surface ?? pricingRenderedSurface(),
    }).map(issue => issue.code);

  it('certifies the pricing surface only after every layer passes', () => {
    const certification = certify(brief, draft, pricingRenderedSurface());
    expect(certification.kind).toBe('rendered-marketing-copy');
    expect(certification.route).toBe('/pricing');
    expect(certification.reviewDigest).toBe(
      createMarketingCopyReviewDigest(brief, draft)
    );
    expect(certification.reviews).toHaveLength(4);
    expect(certifiedCodes(certification)).toEqual([]);
  });

  it('refuses to certify a registry pass whose rendered words differ', () => {
    const surface = mutateLine(
      pricingRenderedSurface(),
      'final',
      'supporting:0',
      'Start free trial'
    );
    expect(() => certify(brief, draft, surface)).toThrow(
      /rendered-text-mismatch/
    );
  });

  it('marks a certification stale when rendered output changes afterwards', () => {
    const certification = certify(brief, draft, pricingRenderedSurface());
    const drifted = mutateLine(
      pricingRenderedSurface(),
      'plan-free',
      'supporting:0',
      'Free for a year'
    );
    expect(certifiedCodes(certification, { surface: drifted })).toContain(
      'stale-rendered-copy'
    );
  });

  it('marks a certification stale when the reviewed draft changes afterwards', () => {
    const certification = certify(brief, draft, pricingRenderedSurface());
    const revisedDraft: MarketingCopyPageDraft = {
      ...draft,
      sections: draft.sections.map(section =>
        section.sectionId === 'compare'
          ? { ...section, headline: 'Compare Every Feature' }
          : section
      ),
    };
    expect(certifiedCodes(certification, { draft: revisedDraft })).toContain(
      'stale-review-digest'
    );
  });

  it('marks a certification stale when the deployed source version changes', () => {
    const certification = certify(brief, draft, pricingRenderedSurface());
    const redeployed: RenderedCopySurface = {
      ...pricingRenderedSurface(),
      sourceVersion: 'a-different-deploy',
    };
    const codes = certifiedCodes(certification, { surface: redeployed });
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
    const errorBrief = publicErrorFallbackCopyBrief();
    const errorDraft = publicErrorFallbackReviewedDraft();
    const certification = certify(
      errorBrief,
      errorDraft,
      errorFallbackRenderedSurface()
    );
    expect(certification.state).toBe('error');
    expect(
      auditRenderedCopyCertification(certification, {
        brief: errorBrief,
        draft: errorDraft,
        surface: errorFallbackRenderedSurface(),
      })
    ).toEqual([]);
  });
});
