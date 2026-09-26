import { describe, expect, it } from 'vitest';
import {
  auditRenderedCopy,
  createMarketingCopyReviewDigest,
  createRenderedCopyDigest,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
  type RenderedCopyCertification,
  type RenderedCopySurface,
} from '@/data/marketing';

const SOURCE_VERSION = '107b5408301a5f3304c875a6e453221ba3742b29';

const brief: MarketingCopyPageBrief = {
  pageId: 'pricing',
  route: '/pricing',
  audience: 'independent artists',
  objective: 'start a paid plan',
  claims: [
    {
      id: 'free-profile',
      statement: 'A profile can be claimed for free.',
      evidence: ['route'],
    },
  ],
  outcomes: [
    {
      id: 'claim-free',
      statement: 'Claim a profile without paying.',
      claimIds: ['free-profile'],
    },
  ],
  actions: [{ id: 'claim', statement: 'Claim the profile.' }],
  sections: [
    {
      sectionId: 'hero',
      storyBeat: 'promise',
      sectionJob: 'name the product outcome',
      customerOutcome: 'the artist claims a profile for free',
      messageSubject: 'profile',
      visualEvidence: 'the pricing table',
      allowedClaimIds: ['free-profile'],
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
      headline: 'Claim your profile free',
      claimIds: ['free-profile'],
      lineBindings: [
        {
          lineId: 'headline',
          role: 'headline',
          outcomeId: 'claim-free',
        },
      ],
      meaningTrace: 'The headline states the free claim outcome.',
      tasteTags: ['direct'],
    },
  ],
};

function surface(
  overrides: Partial<RenderedCopySurface> = {}
): RenderedCopySurface {
  return {
    route: '/pricing',
    sourceVersion: SOURCE_VERSION,
    register: 'jovie-marketing',
    lines: [
      {
        sectionId: 'hero',
        lineId: 'headline',
        role: 'headline',
        text: 'Claim your profile free',
      },
    ],
    ...overrides,
  };
}

function certify(
  target: RenderedCopySurface,
  overrides: Partial<RenderedCopyCertification> = {}
): RenderedCopyCertification {
  return {
    route: target.route,
    stateId: target.stateId,
    sourceVersion: target.sourceVersion,
    reviewDigest: createMarketingCopyReviewDigest(brief, draft),
    renderedDigest: createRenderedCopyDigest(target),
    certifiedAt: '2026-09-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('rendered marketing copy certification', () => {
  it('passes when rendered words match the certified draft and digests', () => {
    const rendered = surface();
    expect(
      auditRenderedCopy(brief, draft, rendered, certify(rendered))
    ).toEqual([]);
  });

  it('fails when the route renders different words than the registry passed', () => {
    const rendered = surface();
    const drifted = surface({
      lines: [
        {
          sectionId: 'hero',
          lineId: 'headline',
          role: 'headline',
          text: 'Grow your fanbase overnight',
        },
      ],
    });
    const issues = auditRenderedCopy(
      brief,
      draft,
      drifted,
      certify(rendered, { renderedDigest: createRenderedCopyDigest(drifted) })
    );
    expect(issues.some(issue => issue.code === 'rendered-text-mismatch')).toBe(
      true
    );
  });

  it('fails when the rendered digest is stale after rendered text changed', () => {
    const original = surface();
    const drifted = surface({
      lines: [
        {
          sectionId: 'hero',
          lineId: 'headline',
          role: 'headline',
          text: 'Claim your profile free today',
        },
      ],
    });
    const issues = auditRenderedCopy(brief, draft, drifted, certify(original));
    expect(issues.some(issue => issue.code === 'stale-rendered-digest')).toBe(
      true
    );
  });

  it('fails when a claim or evidence revision invalidates the review digest', () => {
    const rendered = surface();
    const revisedBrief: MarketingCopyPageBrief = {
      ...brief,
      claims: [
        {
          id: 'free-profile',
          statement: 'A profile can be claimed free for 30 days.',
          evidence: ['route'],
        },
      ],
    };
    const issues = auditRenderedCopy(
      revisedBrief,
      draft,
      rendered,
      certify(rendered)
    );
    expect(issues.some(issue => issue.code === 'stale-review-digest')).toBe(
      true
    );
  });

  it('fails when the surface was captured from a different source version', () => {
    const rendered = surface();
    const issues = auditRenderedCopy(
      brief,
      draft,
      surface({ sourceVersion: 'e5ebbf25be0000000000000000000000000000' }),
      certify(rendered)
    );
    expect(issues.some(issue => issue.code === 'stale-source-version')).toBe(
      true
    );
  });

  it('lets an approved exception cover intentional rendered drift', () => {
    const drifted = surface({
      lines: [
        {
          sectionId: 'hero',
          lineId: 'headline',
          role: 'headline',
          text: 'Claim your free profile',
        },
      ],
    });
    const issues = auditRenderedCopy(
      brief,
      draft,
      drifted,
      certify(drifted, {
        exceptions: [
          {
            sectionId: 'hero',
            lineId: 'headline',
            approvedBy: 'taste-decision-2026-09-20-hero-word-order',
            reason: 'Founder-approved word order experiment.',
          },
        ],
      })
    );
    expect(issues).toEqual([]);
  });

  it('rejects an exception with no approving reviewer', () => {
    const drifted = surface({
      lines: [
        {
          sectionId: 'hero',
          lineId: 'headline',
          role: 'headline',
          text: 'Claim your free profile',
        },
      ],
    });
    const issues = auditRenderedCopy(
      brief,
      draft,
      drifted,
      certify(drifted, {
        exceptions: [
          {
            sectionId: 'hero',
            lineId: 'headline',
            approvedBy: '',
            reason: 'Unapproved drift.',
          },
        ],
      })
    );
    expect(issues.some(issue => issue.code === 'unapproved-exception')).toBe(
      true
    );
    expect(issues.some(issue => issue.code === 'rendered-text-mismatch')).toBe(
      true
    );
  });

  it('flags rendered lines the draft never certified', () => {
    const rendered = surface({
      lines: [
        ...surface().lines,
        {
          sectionId: 'hero',
          lineId: 'supporting:0',
          role: 'supporting' as const,
          text: 'Cancel anytime.',
        },
      ],
    });
    const issues = auditRenderedCopy(brief, draft, rendered, certify(rendered));
    expect(issues.some(issue => issue.code === 'unbound-rendered-line')).toBe(
      true
    );
  });

  it('flags certified lines the route never renders', () => {
    const rendered = surface({ lines: [] });
    const issues = auditRenderedCopy(brief, draft, rendered, certify(rendered));
    expect(issues.some(issue => issue.code === 'unrendered-bound-line')).toBe(
      true
    );
  });

  it('lints rendered text even when it matches the certified draft', () => {
    const promisedDraft: MarketingCopyPageDraft = {
      ...draft,
      sections: [
        {
          ...draft.sections[0],
          headline: 'Guaranteed streams on every release',
        },
      ],
    };
    const rendered = surface({
      lines: [
        {
          sectionId: 'hero',
          lineId: 'headline',
          role: 'headline',
          text: 'Guaranteed streams on every release',
        },
      ],
    });
    const certification = certify(rendered, {
      reviewDigest: createMarketingCopyReviewDigest(brief, promisedDraft),
    });
    const issues = auditRenderedCopy(
      brief,
      promisedDraft,
      rendered,
      certification
    );
    expect(issues.some(issue => issue.code === 'rendered-copy-rule')).toBe(
      true
    );
  });
});

describe('rendered product UI state certification', () => {
  const uiBrief: MarketingCopyPageBrief = {
    pageId: 'payout-error',
    route: '/settings/payouts',
    audience: 'artists on a paid plan',
    objective: 'recover payout setup',
    claims: [
      {
        id: 'payout-retry',
        statement: 'A failed payout connection can be retried.',
        evidence: ['route'],
      },
    ],
    outcomes: [
      {
        id: 'recover-payout',
        statement: 'Reconnect payouts after a failure.',
        claimIds: ['payout-retry'],
      },
    ],
    actions: [{ id: 'retry', statement: 'Try again.' }],
    sections: [
      {
        sectionId: 'payout-failed',
        storyBeat: 'recovery',
        sectionJob: 'state the failure and the next step',
        customerOutcome: 'the artist reconnects payouts',
        messageSubject: 'payouts',
        visualEvidence: 'the error state',
        allowedClaimIds: ['payout-retry'],
        headlineWordLimit: 10,
        headlineSignals: [['payout']],
      },
    ],
  };

  const uiDraft: MarketingCopyPageDraft = {
    pageId: uiBrief.pageId,
    route: uiBrief.route,
    sections: [
      {
        sectionId: 'payout-failed',
        candidateId: 'payout-failed-v1',
        control: { headline: 'Something went wrong.' },
        headline: 'Payout connection failed',
        body: 'Your bank details did not save.',
        claimIds: ['payout-retry'],
        lineBindings: [
          {
            lineId: 'headline',
            role: 'headline',
            outcomeId: 'recover-payout',
          },
          { lineId: 'body', role: 'body', actionId: 'retry' },
        ],
        meaningTrace: 'The error names the failure and the retry path.',
        tasteTags: ['direct'],
      },
    ],
  };

  function uiSurface(
    overrides: Partial<RenderedCopySurface> = {}
  ): RenderedCopySurface {
    return {
      route: '/settings/payouts',
      stateId: 'payout-connection-failed',
      sourceVersion: SOURCE_VERSION,
      register: 'jovie-product-ui',
      lines: [
        {
          sectionId: 'payout-failed',
          lineId: 'headline',
          role: 'headline',
          text: 'Payout connection failed',
        },
        {
          sectionId: 'payout-failed',
          lineId: 'body',
          role: 'body',
          text: 'Your bank details did not save.',
        },
      ],
      ...overrides,
    };
  }

  function uiCertify(
    target: RenderedCopySurface,
    overrides: Partial<RenderedCopyCertification> = {}
  ): RenderedCopyCertification {
    return {
      route: target.route,
      stateId: target.stateId,
      sourceVersion: target.sourceVersion,
      reviewDigest: createMarketingCopyReviewDigest(uiBrief, uiDraft),
      renderedDigest: createRenderedCopyDigest(target),
      certifiedAt: '2026-09-26T00:00:00.000Z',
      ...overrides,
    };
  }

  it('passes an error state that names the failure and a recovery action', () => {
    const rendered = uiSurface();
    expect(
      auditRenderedCopy(uiBrief, uiDraft, rendered, uiCertify(rendered))
    ).toEqual([]);
  });

  it('fails an error state that renders no concrete recovery action', () => {
    const noActionDraft: MarketingCopyPageDraft = {
      ...uiDraft,
      sections: [
        {
          ...uiDraft.sections[0],
          lineBindings: [
            {
              lineId: 'headline',
              role: 'headline',
              outcomeId: 'recover-payout',
            },
          ],
        },
      ],
    };
    const rendered = uiSurface();
    const issues = auditRenderedCopy(uiBrief, noActionDraft, rendered, {
      ...uiCertify(rendered),
      reviewDigest: createMarketingCopyReviewDigest(uiBrief, noActionDraft),
    });
    expect(issues.some(issue => issue.code === 'missing-recovery-action')).toBe(
      true
    );
  });

  it('fails when the rendered state id is not the certified one', () => {
    const rendered = uiSurface();
    const issues = auditRenderedCopy(
      uiBrief,
      uiDraft,
      uiSurface({ stateId: 'payout-connection-pending' }),
      uiCertify(rendered)
    );
    expect(issues.some(issue => issue.code === 'rendered-state-mismatch')).toBe(
      true
    );
  });
});
