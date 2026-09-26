import { describe, expect, it } from 'vitest';
import {
  auditMarketingCopySemantics,
  createMarketingCopyReviewDigest,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
} from '@/data/marketing';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';
import {
  getPublicPriceClaim,
  PRO_TRIAL_TRUTH,
} from '@/lib/billing/offer-truth';
import {
  auditRenderedCopyCertification,
  auditRenderedCopySurface,
  certifiedLinesFromDraft,
  certifyRenderedCopySurface,
  type RenderedCopyExpectation,
  type RenderedCopySurface,
} from '@/lib/copy/rendered-surface';

const SOURCE_VERSION = 'src-1';

const brief: MarketingCopyPageBrief = {
  pageId: 'pricing',
  route: '/pricing',
  audience: 'independent artists',
  objective: 'earn a plan choice',
  claims: [
    {
      id: 'free-forever',
      statement: 'Artist profiles are free forever.',
      evidence: ['offer-truth:free'],
    },
    {
      id: 'pro-price',
      statement: 'Artist Visibility Pro is a paid monthly plan.',
      evidence: ['offer-truth:pro'],
    },
  ],
  outcomes: [
    {
      id: 'pick-plan',
      statement: 'Choose the plan that fits the release.',
      claimIds: ['free-forever', 'pro-price'],
    },
  ],
  actions: [{ id: 'claim', statement: 'Claim your free profile.' }],
  sections: [
    {
      sectionId: 'hero',
      storyBeat: 'promise',
      sectionJob: 'name the pricing outcome',
      customerOutcome: 'the artist picks a plan that fits',
      messageSubject: 'pricing',
      visualEvidence: 'live plan cards',
      allowedClaimIds: ['free-forever', 'pro-price'],
      headlineWordLimit: 8,
      headlineSignals: [['pricing', 'plan', 'free']],
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
      control: { headline: 'Plans for every artist.' },
      headline: 'One free profile. Paid plans that fit.',
      claimIds: ['free-forever', 'pro-price'],
      lineBindings: [
        { lineId: 'headline', role: 'headline', outcomeId: 'pick-plan' },
      ],
      meaningTrace: 'Names the free profile and paid plan choice honestly.',
      tasteTags: ['direct'],
    },
  ],
};

const proClaim = getPublicPriceClaim('pro');

const pricingExpectation: RenderedCopyExpectation = {
  route: '/pricing',
  stateId: 'default',
  sourceVersion: SOURCE_VERSION,
  register: 'jovie-marketing',
  lines: [
    ...certifiedLinesFromDraft(draft),
    {
      lineId: 'pricing/pro/price',
      role: 'label',
      value: `${proClaim.priceLabel}${proClaim.cadence}`,
      claimIds: ['pro-price'],
    },
    {
      lineId: 'pricing/pro/trial',
      role: 'label',
      value: PRO_TRIAL_TRUTH,
      claimIds: ['pro-price'],
    },
  ],
  allowedLiterals: [
    `${proClaim.priceLabel}${proClaim.cadence}`,
    PRO_TRIAL_TRUTH,
  ],
};

const pricingSurface: RenderedCopySurface = {
  route: '/pricing',
  stateId: 'default',
  sourceVersion: SOURCE_VERSION,
  lines: [
    {
      lineId: 'hero/headline',
      role: 'headline',
      value: 'One free profile. Paid plans that fit.',
    },
    {
      lineId: 'pricing/pro/price',
      role: 'label',
      value: `${proClaim.priceLabel}${proClaim.cadence}`,
    },
    {
      lineId: 'pricing/pro/trial',
      role: 'label',
      value: PRO_TRIAL_TRUTH,
    },
  ],
};

const errorExpectation: RenderedCopyExpectation = {
  route: '/pricing',
  stateId: 'error:public-page',
  sourceVersion: SOURCE_VERSION,
  register: 'jovie-product-ui',
  lines: [
    {
      lineId: 'error/title',
      role: 'headline',
      value: RECOVERY_COPY.title,
    },
    {
      lineId: 'error/description',
      role: 'body',
      value: 'Try refreshing the page.',
    },
  ],
  requiredActions: [{ actionId: 'retry', labels: [RECOVERY_COPY.retryLabel] }],
  exceptions: [
    {
      lineId: 'error/details-disclosure',
      reason:
        'Opt-in diagnostics disclosure label is intentionally terse (recovery-contract detailsLabel).',
    },
  ],
};

const errorSurface: RenderedCopySurface = {
  route: '/pricing',
  stateId: 'error:public-page',
  sourceVersion: SOURCE_VERSION,
  lines: [
    { lineId: 'error/title', role: 'headline', value: RECOVERY_COPY.title },
    {
      lineId: 'error/description',
      role: 'body',
      value: 'Try refreshing the page.',
    },
    { lineId: 'action:retry', role: 'action', value: RECOVERY_COPY.retryLabel },
    {
      lineId: 'error/details-disclosure',
      role: 'label',
      value: RECOVERY_COPY.detailsLabel,
    },
  ],
};

describe('rendered marketing copy surface (JOV-6478)', () => {
  it('certifies a /pricing render that matches the reviewed draft and offer truth', () => {
    expect(
      auditRenderedCopySurface(pricingSurface, pricingExpectation)
    ).toEqual([]);
  });

  it('fails when the registry passes but the route renders different words', () => {
    expect(
      auditMarketingCopySemantics(brief, draft, { enforcement: 'delta' }).status
    ).toBe('pass');
    const drifted: RenderedCopySurface = {
      ...pricingSurface,
      lines: pricingSurface.lines.map(line =>
        line.lineId === 'hero/headline'
          ? { ...line, value: 'Grow your fanbase overnight.' }
          : line
      ),
    };
    const issues = auditRenderedCopySurface(drifted, pricingExpectation);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'changed-rendered-text' }),
      ])
    );
  });

  it('rejects unsupported pricing literals even inside certified line ids', () => {
    const inflated: RenderedCopySurface = {
      ...pricingSurface,
      lines: pricingSurface.lines.map(line =>
        line.lineId === 'pricing/pro/price'
          ? { ...line, value: '$149/mo' }
          : line
      ),
    };
    const issues = auditRenderedCopySurface(inflated, pricingExpectation);
    const codes = issues.map(i => i.code);
    expect(codes).toContain('changed-rendered-text');
    expect(codes).toContain('unsupported-rendered-claim');
  });

  it('rejects invented success metrics in rendered copy', () => {
    const invented: RenderedCopySurface = {
      ...pricingSurface,
      lines: [
        ...pricingSurface.lines,
        { lineId: 'hero/stat', role: 'label', value: '300% more streams' },
      ],
    };
    const issues = auditRenderedCopySurface(invented, pricingExpectation);
    const codes = issues.map(i => i.code);
    expect(codes).toContain('uncertified-rendered-line');
    expect(codes).toContain('unsupported-rendered-claim');
  });

  it('fails when a certified line is missing from the render', () => {
    const missingCertified: RenderedCopySurface = {
      ...pricingSurface,
      lines: pricingSurface.lines.filter(
        line => line.lineId !== 'hero/headline'
      ),
    };
    const issues = auditRenderedCopySurface(
      missingCertified,
      pricingExpectation
    );
    expect(issues.some(i => i.code === 'missing-rendered-line')).toBe(true);
  });

  it('requires the recovery action in a rendered error state', () => {
    expect(auditRenderedCopySurface(errorSurface, errorExpectation)).toEqual(
      []
    );
    const noRecovery: RenderedCopySurface = {
      ...errorSurface,
      lines: errorSurface.lines.filter(line => line.lineId !== 'action:retry'),
    };
    expect(
      auditRenderedCopySurface(noRecovery, errorExpectation).some(
        i => i.code === 'missing-recovery-action'
      )
    ).toBe(true);
  });

  it('lets an approved terse-label exception survive while uncertified lines fail', () => {
    const issues = auditRenderedCopySurface(errorSurface, errorExpectation);
    expect(issues).toEqual([]);
    const strict: RenderedCopyExpectation = {
      ...errorExpectation,
      exceptions: [],
    };
    expect(
      auditRenderedCopySurface(errorSurface, strict).some(
        i => i.code === 'uncertified-rendered-line'
      )
    ).toBe(true);
  });
});

describe('rendered copy certification receipts', () => {
  const certifiedAt = '2026-09-26T12:00:00.000Z';
  const reviewDigest = createMarketingCopyReviewDigest(brief, draft);

  it('records route, state, source version, and both digests', () => {
    const cert = certifyRenderedCopySurface({
      surface: pricingSurface,
      expectation: pricingExpectation,
      certifiedAt,
      reviewDigest,
    });
    expect(cert.route).toBe('/pricing');
    expect(cert.stateId).toBe('default');
    expect(cert.sourceVersion).toBe(SOURCE_VERSION);
    expect(cert.renderedDigest).toMatch(
      /^rendered-copy\/1\.0\.0\/sha256\/[a-f0-9]{64}$/
    );
    expect(cert.reviewDigest).toBe(reviewDigest);
    expect(
      auditRenderedCopyCertification(cert, pricingSurface, pricingExpectation)
    ).toEqual([]);
  });

  it('refuses to certify a failing surface', () => {
    const drifted: RenderedCopySurface = {
      ...pricingSurface,
      lines: pricingSurface.lines.map(line =>
        line.lineId === 'hero/headline'
          ? { ...line, value: 'Different words.' }
          : line
      ),
    };
    expect(() =>
      certifyRenderedCopySurface({
        surface: drifted,
        expectation: pricingExpectation,
        certifiedAt,
      })
    ).toThrow(/changed-rendered-text/);
  });

  it('invalidates the receipt when rendered text changes', () => {
    const cert = certifyRenderedCopySurface({
      surface: pricingSurface,
      expectation: pricingExpectation,
      certifiedAt,
    });
    const changed: RenderedCopySurface = {
      ...pricingSurface,
      lines: pricingSurface.lines.map(line =>
        line.lineId === 'pricing/pro/trial'
          ? { ...line, value: '7-day Pro trial.' }
          : line
      ),
    };
    const issues = auditRenderedCopyCertification(
      cert,
      changed,
      pricingExpectation
    );
    expect(issues.some(i => i.code === 'stale-rendered-digest')).toBe(true);
  });

  it('invalidates the receipt when claims or literals are revised', () => {
    const cert = certifyRenderedCopySurface({
      surface: pricingSurface,
      expectation: pricingExpectation,
      certifiedAt,
    });
    const revised: RenderedCopyExpectation = {
      ...pricingExpectation,
      allowedLiterals: [...pricingExpectation.allowedLiterals!, '$99/mo'],
    };
    const issues = auditRenderedCopyCertification(
      cert,
      pricingSurface,
      revised
    );
    expect(issues.some(i => i.code === 'stale-expectation-digest')).toBe(true);
  });

  it('flags source-version drift independently of the digest', () => {
    const cert = certifyRenderedCopySurface({
      surface: errorSurface,
      expectation: errorExpectation,
      certifiedAt,
    });
    const redeployed: RenderedCopySurface = {
      ...errorSurface,
      sourceVersion: 'newer-source-sha',
    };
    const issues = auditRenderedCopyCertification(
      cert,
      redeployed,
      errorExpectation
    );
    expect(issues.some(i => i.code === 'source-version-drift')).toBe(true);
    expect(issues.some(i => i.code === 'stale-rendered-digest')).toBe(true);
  });
});
