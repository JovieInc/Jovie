import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  COMPANY_FUNNEL_STEPS,
  type CompanyMetric,
  type CompanyStateSnapshot,
  REVENUE_CONE_STEPS,
} from '@/lib/ovie/company-state';
import { companyBlocker, homeConstraint } from './company-blocker';

const NOW = new Date('2026-11-08T23:00:00.000Z');

function metric<T>(
  value: T | null,
  status: CompanyMetric<T>['status'] = 'green'
): CompanyMetric<T> {
  return {
    value,
    status,
    observedAt: '2026-11-08T22:55:00.000Z',
    source: 'test',
    sourceRevision: null,
    sourceWindow: '7d',
    freshnessBudgetMs: 60 * 60 * 1000,
    semantics: 'exact',
    confidence: 'high',
  };
}

type Input = Parameters<typeof companyBlocker>[0];

function snapshot(
  overrides: {
    activeConstraint?: string | null;
    funnel?: Partial<
      Record<(typeof COMPANY_FUNNEL_STEPS)[number], number | null>
    >;
    cone?: Partial<
      Record<(typeof REVENUE_CONE_STEPS)[number], 'green' | 'red' | 'unknown'>
    >;
    investigations?: Input['investigations'];
  } = {}
): Input {
  const funnel = Object.fromEntries(
    COMPANY_FUNNEL_STEPS.map(step => [
      step,
      metric<number>(
        overrides.funnel?.[step] === undefined ? 5 : overrides.funnel[step]
      ),
    ])
  ) as CompanyStateSnapshot['funnel'];
  const certification = Object.fromEntries(
    REVENUE_CONE_STEPS.map(step => {
      const status = overrides.cone?.[step] ?? 'green';
      return [step, metric(status, status)];
    })
  ) as CompanyStateSnapshot['certification'];
  return {
    activeConstraint: overrides.activeConstraint ?? null,
    certification,
    funnel,
    generatedAt: '2026-11-08T22:58:00.000Z',
    investigations: overrides.investigations ?? [],
  } as Input;
}

describe('companyBlocker', () => {
  it('names a failing certification step with its consequence', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'certification:public_profile',
        cone: { public_profile: 'red' },
      }),
      NOW
    );
    expect(blocker).toMatchObject({
      id: 'certification:public_profile',
      kind: 'certification',
      tone: 'bad',
      text: 'The public profile fails certification, so no artist can be sent their profile yet',
      detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
      observedAt: '2026-11-08T22:58:00.000Z',
    });
  });

  it('warns, not fails, when a certification is only stale or unknown', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'certification:checkout_payment_entitlement',
        cone: { checkout_payment_entitlement: 'unknown' },
      }),
      NOW
    );
    expect(blocker?.tone).toBe('warn');
    expect(blocker?.text).toBe(
      'Checkout has no fresh certification, so nobody can pay yet'
    );
  });

  it('names a funnel drop with the step before it', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'funnel:claim_attempted',
        funnel: { claim_shown: 12, claim_attempted: 0, paid: 0 },
      }),
      NOW
    );
    expect(blocker).toMatchObject({
      kind: 'funnel',
      tone: 'bad',
      text: '12 claim prompts shown this week, but no claim attempts',
      detailsHref: APP_ROUTES.ADMIN_GROWTH,
    });
  });

  it('names the first measured zero, not a step that was never instrumented', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'funnel:claim_shown',
        funnel: { claim_shown: null, checkout_started: 0, paid: 0 },
      }),
      NOW
    );
    expect(blocker).toMatchObject({
      id: 'funnel:checkout_started',
      text: '5 checkout views this week, but no checkout starts',
    });
  });

  it('leaves Home to shipping health when only an unmeasured step stands and revenue is flowing', () => {
    expect(
      companyBlocker(
        snapshot({
          activeConstraint: 'funnel:claim_shown',
          funnel: { claim_shown: null, paid: 2 },
        }),
        NOW
      )
    ).toBeNull();
  });

  it('never reads as clear when paid signups are unmeasured', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'funnel:claim_shown',
        funnel: { claim_shown: null, paid: null },
      }),
      NOW
    );
    expect(blocker).toMatchObject({ id: 'funnel:paid', tone: 'warn' });
    expect(blocker?.text).toBe(
      "Paid signups aren't measured yet, so the funnel can't say where it stops"
    );
  });

  it('does not read an all-zero funnel with nothing paid as clear', () => {
    const zero = Object.fromEntries(
      COMPANY_FUNNEL_STEPS.map(step => [step, 0])
    );
    const blocker = companyBlocker(snapshot({ funnel: zero }), NOW);
    expect(blocker).toMatchObject({
      id: 'funnel:visits',
      text: 'No real visits this week',
    });
  });

  it('is clear when nothing is active and signups are being paid', () => {
    expect(companyBlocker(snapshot({ funnel: { paid: 1 } }), NOW)).toBeNull();
  });

  it('carries the matching investigation so Home can say since when and what is next', () => {
    const blocker = companyBlocker(
      snapshot({
        activeConstraint: 'certification:public_profile',
        cone: { public_profile: 'red' },
        investigations: [
          {
            id: 'certification:public_profile',
            firstObservedAt: '2026-11-07T10:00:00.000Z',
            nextAction: 'Re-run prod-cert after the profile fix deploys',
          } as Input['investigations'][number],
        ],
      }),
      NOW
    );
    expect(blocker?.since).toBe('2026-11-07T10:00:00.000Z');
    expect(blocker?.nextAction).toBe(
      'Re-run prod-cert after the profile fix deploys'
    );
  });

  it('ignores an id it cannot name', () => {
    expect(
      companyBlocker(snapshot({ activeConstraint: 'mystery:thing' }), NOW)
    ).toBeNull();
  });
});

describe('homeConstraint', () => {
  const shipping = {
    tone: 'warn' as const,
    text: 'Shipping data is disconnected',
  };

  it('leads with the revenue blocker over shipping health', () => {
    const revenue = companyBlocker(
      snapshot({
        activeConstraint: 'certification:public_profile',
        cone: { public_profile: 'red' },
      }),
      NOW
    );
    expect(homeConstraint(revenue, shipping)).toEqual({
      tone: 'bad',
      text: revenue?.text,
      detailsHref: APP_ROUTES.ADMIN_CERTIFICATIONS,
    });
  });

  it('falls back to shipping health only when no revenue blocker is known', () => {
    expect(homeConstraint(null, shipping)).toBe(shipping);
    expect(homeConstraint(null, null)).toBeNull();
  });
});
