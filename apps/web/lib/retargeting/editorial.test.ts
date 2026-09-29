import { describe, expect, it } from 'vitest';
import { INVESTOR_ANSWER_REUSE_PACK } from '@/data/investorAnswerReuseCopy';
import type {
  AnswerDerivative,
  AnswerReusePack,
} from '@/lib/investors/answer-reuse';
import {
  buildEditorialRetargetingEventFields,
  buildEditorialRetargetingRegistry,
  EDITORIAL_RETARGETING_EVENT,
  findEditorialRetargetingEntry,
  hasSensitiveQueryParams,
  resolveEditorialRetargetingState,
} from './editorial';

const DECIDED_AT = '2026-09-28T12:00:00.000Z';

function fullyApprove(derivative: AnswerDerivative): AnswerDerivative {
  return {
    ...derivative,
    review: {
      state: 'approved',
      reviewedBy: 'Editorial reviewer',
      reviewedAt: DECIDED_AT,
    },
    distribution: {
      publicPublishing: {
        state: 'approved',
        approvedBy: 'Publishing owner',
        decidedAt: DECIDED_AT,
      },
      emailSocialSending: derivative.distribution.emailSocialSending,
      paidPromotion: {
        state: 'approved',
        approvedBy: 'Pilot owner',
        decidedAt: DECIDED_AT,
      },
    },
    releaseState: 'published',
  };
}

function packWith(
  transform: (derivative: AnswerDerivative) => AnswerDerivative
): AnswerReusePack {
  return {
    sourceAnswer: INVESTOR_ANSWER_REUSE_PACK.sourceAnswer,
    derivatives: INVESTOR_ANSWER_REUSE_PACK.derivatives.map(transform),
  };
}

const approvedCustomerPack = packWith(derivative =>
  derivative.channel === 'customer-editorial'
    ? fullyApprove(derivative)
    : derivative
);

describe('buildEditorialRetargetingRegistry', () => {
  it('registers no routes while every derivative is a draft', () => {
    expect(
      buildEditorialRetargetingRegistry(INVESTOR_ANSWER_REUSE_PACK)
    ).toEqual([]);
  });

  it('registers only a fully approved published public editorial route', () => {
    const registry = buildEditorialRetargetingRegistry(approvedCustomerPack);
    expect(registry).toEqual([
      {
        canonicalPath: '/blog/one-profile-for-your-work',
        derivativeId: 'company-identity-customer-explanation',
        contentRevision: '2026-09-28',
      },
    ]);
  });

  it('excludes approved editorial copy without paid-promotion approval', () => {
    const pack = packWith(derivative =>
      derivative.channel === 'customer-editorial'
        ? {
            ...fullyApprove(derivative),
            distribution: {
              ...fullyApprove(derivative).distribution,
              paidPromotion: { state: 'not-approved' },
            },
          }
        : derivative
    );
    expect(buildEditorialRetargetingRegistry(pack)).toEqual([]);
  });

  it('never registers private-investor or internal derivatives even when approved', () => {
    const pack = packWith(derivative => fullyApprove(derivative));
    const registry = buildEditorialRetargetingRegistry(pack);
    expect(
      registry.every(entry => entry.canonicalPath.startsWith('/blog/'))
    ).toBe(true);
    expect(
      registry.some(
        entry => entry.derivativeId === 'company-identity-investor-slide'
      )
    ).toBe(false);
  });
});

describe('findEditorialRetargetingEntry', () => {
  const registry = buildEditorialRetargetingRegistry(approvedCustomerPack);

  it('matches the exact canonical path only', () => {
    expect(
      findEditorialRetargetingEntry('/blog/one-profile-for-your-work', registry)
        ?.derivativeId
    ).toBe('company-identity-customer-explanation');
    expect(
      findEditorialRetargetingEntry(
        '/blog/one-profile-for-your-work/extra',
        registry
      )
    ).toBeUndefined();
    expect(
      findEditorialRetargetingEntry('/investor-portal', registry)
    ).toBeUndefined();
    expect(findEditorialRetargetingEntry(null, registry)).toBeUndefined();
  });
});

describe('hasSensitiveQueryParams', () => {
  it('suppresses tracking on identity, token, and click-id parameters', () => {
    for (const search of [
      '?token=abc',
      '?email=investor%40fund.com',
      '?investor=Jane+Doe',
      '?objection=valuation',
      '?utm_source=newsletter',
      '?fbclid=xyz',
      '?preview=secret',
      '?safe=1&access_token=abc',
    ]) {
      expect(hasSensitiveQueryParams(search)).toBe(true);
    }
  });

  it('allows parameter-free and benign queries', () => {
    for (const search of [null, '', '?', '?page=2', '?lang=en']) {
      expect(hasSensitiveQueryParams(search)).toBe(false);
    }
  });
});

describe('buildEditorialRetargetingEventFields', () => {
  it('emits only canonical non-sensitive fields', () => {
    const [entry] = buildEditorialRetargetingRegistry(approvedCustomerPack);
    const fields = buildEditorialRetargetingEventFields(entry);
    expect(Object.keys(fields).sort()).toEqual([
      'content_path',
      'content_revision',
      'derivative_id',
    ]);
    expect(fields).toEqual({
      content_path: '/blog/one-profile-for-your-work',
      content_revision: '2026-09-28',
      derivative_id: 'company-identity-customer-explanation',
    });
  });
});

describe('resolveEditorialRetargetingState', () => {
  const [entry] = buildEditorialRetargetingRegistry(approvedCustomerPack);
  const base = {
    hasPixelId: true,
    isPassive: false,
    entry,
    hasSensitiveQuery: false,
    isDemo: false,
    hasMarketingConsent: true,
  };

  it('is eligible only when every gate passes', () => {
    expect(resolveEditorialRetargetingState(base)).toBe('eligible');
  });

  it('suppresses on missing pixel, passive runtime, unregistered route, sensitive query, demo, and denied consent', () => {
    expect(
      resolveEditorialRetargetingState({ ...base, hasPixelId: false })
    ).toBe('suppressed-unconfigured');
    expect(resolveEditorialRetargetingState({ ...base, isPassive: true })).toBe(
      'suppressed-passive-runtime'
    );
    expect(
      resolveEditorialRetargetingState({ ...base, entry: undefined })
    ).toBe('suppressed-unregistered-route');
    expect(
      resolveEditorialRetargetingState({ ...base, hasSensitiveQuery: true })
    ).toBe('suppressed-sensitive-query');
    expect(resolveEditorialRetargetingState({ ...base, isDemo: true })).toBe(
      'suppressed-demo-recording'
    );
    expect(
      resolveEditorialRetargetingState({ ...base, hasMarketingConsent: false })
    ).toBe('suppressed-no-consent');
  });

  it('keeps the event name fixed', () => {
    expect(EDITORIAL_RETARGETING_EVENT).toBe('EditorialArticleView');
  });
});
