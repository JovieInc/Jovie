import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getAuthenticatedAuthRouteRedirect } from './access-route-redirect';
import {
  buildAuthOfferContinueUrl,
  persistAuthOfferFromSearchParams,
  readAuthOfferHandoff,
  resolveAuthenticatedOfferRedirect,
  resolveAuthOfferSummary,
} from './auth-shell-offer';
import { CanonicalUserState } from './canonical-user-state';
import { clearPlanIntent, getPlanIntentRecord } from './plan-intent';

describe('auth offer reconciliation', () => {
  const pro = { plan: 'pro', interval: 'month', artist: 'Tim White' } as const;
  beforeEach(() => {
    clearPlanIntent();
    sessionStorage.clear();
  });
  it('preserves normalized artist intent including Free', () => {
    const handoff = readAuthOfferHandoff(
      new URLSearchParams('plan=free&billing=monthly&artist=Tim%20White')
    );
    expect(handoff).toEqual({ ...pro, plan: 'free' });
    persistAuthOfferFromSearchParams(
      new URLSearchParams('plan=pro&interval=monthly&artist=Tim%20White')
    );
    expect(getPlanIntentRecord()).toEqual(pro);
  });
  it('uses canonical price and terms for the current offer', () => {
    expect(resolveAuthOfferSummary({ handoff: pro })?.detail).toContain(
      '$199/month'
    );
    expect(
      resolveAuthOfferSummary({ handoff: pro, isPaidSubscriber: true })
    ).toEqual({ title: 'Manage your plan' });
    expect(resolveAuthOfferSummary({ handoff: null })).toBeNull();
  });
  it.each(['max', 'team', 'enterprise'] as const)(
    'never converts %s to trial or checkout',
    plan => {
      const handoff = { ...pro, plan };
      expect(buildAuthOfferContinueUrl(handoff)).toBe(APP_ROUTES.PRICING);
      expect(resolveAuthOfferSummary({ handoff })).toEqual({
        title: 'Contact sales',
      });
      expect(
        resolveAuthenticatedOfferRedirect({ handoff, isPaidSubscriber: true })
      ).toBe(APP_ROUTES.SETTINGS_BILLING);
    }
  );
  it('rejects legacy annual purchase without coercing it to monthly checkout', () => {
    const handoff = readAuthOfferHandoff(
      new URLSearchParams('plan=pro&interval=annual')
    );
    expect(handoff?.interval).toBe('year');
    expect(buildAuthOfferContinueUrl(handoff!)).toBe(APP_ROUTES.PRICING);
    expect(resolveAuthOfferSummary({ handoff })?.title).toBe(
      'Choose an available plan'
    );
  });
  it('routes only active users to offer destinations and preserves access-state precedence', () => {
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
        offerHandoff: pro,
      })
    ).toBe(
      `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=pro&interval=month&artist_name=Tim+White`
    );
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
        offerHandoff: pro,
        isPaidSubscriber: true,
      })
    ).toBe(APP_ROUTES.SETTINGS_BILLING);
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.WAITLIST_PENDING, {
        offerHandoff: pro,
      })
    ).toBe(APP_ROUTES.WAITLIST);
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.NEEDS_ONBOARDING, {
        offerHandoff: pro,
      })
    ).toBe(`${APP_ROUTES.START}?fresh_signup=true`);
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.BANNED, {
        offerHandoff: pro,
      })
    ).toBe(APP_ROUTES.UNAVAILABLE);
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
        offerHandoff: pro,
        authState: 'valid_native_state_123',
      })
    ).toContain('/auth/callback?state=');
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
        offerHandoff: pro,
        redirectUrl: '/waitlist/invite?token=abc',
      })
    ).toBe('/waitlist/invite?token=abc');
  });
  it('does not let an explicit checkout return pitch a new plan to an existing subscriber', () => {
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
        offerHandoff: pro,
        isPaidSubscriber: true,
        redirectUrl: APP_ROUTES.ONBOARDING_CHECKOUT,
      })
    ).toBe(APP_ROUTES.SETTINGS_BILLING);
  });

  it('rejects invalid intervals and preserves standalone artist recovery without a paid plan', () => {
    expect(
      readAuthOfferHandoff(new URLSearchParams('plan=pro&interval=forever'))
    ).toBeNull();
    expect(
      readAuthOfferHandoff(
        new URLSearchParams('plan=pro&interval=%20MONTHLY%20')
      )?.interval
    ).toBe('month');
    expect(
      persistAuthOfferFromSearchParams(
        new URLSearchParams('artist=The%20Artist')
      )
    ).toBeNull();
    expect(
      JSON.parse(sessionStorage.getItem('jovie_signup_artist_name')!).value
    ).toBe('The Artist');
    expect(
      resolveAuthOfferSummary({ handoff: { ...pro, plan: 'free' } })?.title
    ).toBe('Claim your profile');
    expect(buildAuthOfferContinueUrl({ ...pro, plan: 'free' })).toBe(
      APP_ROUTES.DASHBOARD
    );
    expect(resolveAuthenticatedOfferRedirect({ handoff: null })).toBeNull();
  });

  it('does not fail auth when claim storage is unavailable', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw Error('quota');
      });
    expect(() =>
      persistAuthOfferFromSearchParams(
        new URLSearchParams('plan=pro&artist=Tim')
      )
    ).not.toThrow();
    spy.mockRestore();
  });
});
