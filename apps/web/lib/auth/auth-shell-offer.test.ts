import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

import {
  parseAuthBillingInterval,
  parseAuthOfferArtist,
  readAuthOfferHandoff,
  resolveAuthenticatedOfferRedirect,
  resolveAuthOfferSummary,
} from './auth-shell-offer';

describe('auth shell offer handoff', () => {
  it('reads plan, billing interval aliases, and artist from the URL', () => {
    expect(
      readAuthOfferHandoff(
        new URLSearchParams(
          'plan=pro&billing=yearly&artist=Motion&artist_name=Ignored'
        )
      )
    ).toEqual({
      plan: 'pro',
      interval: 'annual',
      artist: 'Motion',
    });
    expect(parseAuthBillingInterval('month')).toBe('monthly');
    expect(parseAuthBillingInterval('lifetime')).toBeNull();
    expect(parseAuthOfferArtist('https://evil.example')).toBeNull();
  });

  it('shows the Pro trial summary only when registry trial terms still match', () => {
    expect(ENTITLEMENT_REGISTRY.trial.marketing.displayName).toBe('Pro Trial');
    expect(ENTITLEMENT_REGISTRY.trial.marketing.tagline).toBe(
      '14 days of Pro, on us.'
    );

    expect(
      resolveAuthOfferSummary({
        handoff: { plan: 'pro', interval: 'monthly', artist: null },
      })
    ).toEqual({
      kind: 'pro-trial',
      title: 'Start your Pro trial',
      detail: '14 days · No card required',
    });
  });

  it('does not invent Max trial, days, or no-card copy', () => {
    const summary = resolveAuthOfferSummary({
      handoff: { plan: 'max', interval: 'annual', artist: 'Motion' },
    });

    expect(summary).toEqual({
      kind: 'max-continue',
      title: 'Continue to Max',
    });
    expect(JSON.stringify(summary)).not.toMatch(/trial|14 days|No card/i);
  });

  it('sends existing subscribers to account upgrade, not a new-trial pitch', () => {
    expect(
      resolveAuthOfferSummary({
        handoff: { plan: 'pro', interval: null, artist: null },
        isPaidSubscriber: true,
      })
    ).toEqual({
      kind: 'subscriber-upgrade',
      title: 'Manage your plan',
      href: APP_ROUTES.SETTINGS_BILLING,
    });
    expect(
      resolveAuthenticatedOfferRedirect({
        handoff: { plan: 'max', interval: 'annual', artist: 'Motion' },
        isPaidSubscriber: true,
      })
    ).toBe(APP_ROUTES.SETTINGS_BILLING);
    expect(
      resolveAuthenticatedOfferRedirect({
        handoff: { plan: 'pro', interval: 'annual', artist: 'Motion' },
      })
    ).toBe(
      `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=pro&interval=annual&artist_name=Motion`
    );
  });
});
