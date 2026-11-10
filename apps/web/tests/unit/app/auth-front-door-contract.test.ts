import { describe, expect, it } from 'vitest';
import { authCopy } from '@/components/providers/auth-copy';
import { APP_ROUTES } from '@/constants/routes';
import {
  getHomepageFrontDoorCtaContract,
  PUBLIC_WAITLIST_URL,
} from '@/data/homepageFrontDoorCta';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';

describe('auth front-door contract', () => {
  it('keeps both front-door modes on the one claim CTA routed into /start', () => {
    for (const waitlistEnabled of [true, false]) {
      const contract = getHomepageFrontDoorCtaContract(waitlistEnabled);

      // One front door (Tim, 2026-11-09): every mode resolves the same
      // claim CTA into /start; the server gate decides admit vs reserve.
      expect(contract.primary).toEqual({
        label: 'Claim your handle',
        href: APP_ROUTES.START,
      });
      expect(PUBLIC_WAITLIST_URL).toBe(APP_ROUTES.START);
      expect(contract.primary.href).not.toBe(APP_ROUTES.WAITLIST);
      expect(contract.secondary).toBeNull();
      expect(contract.fallbackSupport).toBe(
        'Free to start. Reserve your name now.'
      );
      // Retired with the self-serve offer (EVENT: Tim, 2026-10-20).
      expect(contract.primary.label).not.toMatch(/request access/i);
      expect(contract.fallbackSupport).not.toMatch(/limited/i);
    }
  });

  it('keeps free acquisition off the marketing doors, claims on the qualify chat, and Pro on the self-serve claim checkout', () => {
    expect(HOMEPAGE_FRONT_DOOR_CTA.primary.href).toBe(APP_ROUTES.START);
    // Claims enter the /start qualify chat (Tim 2026-09-28, JOV-3379).
    expect(MARKETING_CTA_INTENTS.claimProfile.href).toBe(APP_ROUTES.START);
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'free')?.ctaHref
    ).toBe(`${APP_ROUTES.SIGNUP}?plan=free`);
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro')?.ctaHref
    ).toBe(`${APP_ROUTES.CLAIM}?plan=pro`);
    expect(HOMEPAGE_FRONT_DOOR_CTA.primary.href).not.toContain('/waitlist');
    expect(MARKETING_CTA_INTENTS.claimProfile.href).not.toContain('/waitlist');
  });

  it('keeps auth route constants canonical', () => {
    expect(APP_ROUTES.SIGNUP).toBe('/signup');
    expect(APP_ROUTES.SIGNIN).toBe('/signin');
  });

  it('redirects legacy hyphenated auth paths to the canonical auth routes', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = await nextConfig.redirects();

    expect(
      redirects.find(
        (redirect: { source: string }) => redirect.source === '/sign-up'
      )
    ).toMatchObject({
      source: '/sign-up',
      destination: APP_ROUTES.SIGNUP,
      permanent: true,
    });
    expect(
      redirects.find(
        (redirect: { source: string }) => redirect.source === '/sign-in'
      )
    ).toMatchObject({
      source: '/sign-in',
      destination: APP_ROUTES.SIGNIN,
      permanent: true,
    });
    // Cold `import('next.config.js')` pulls the whole Next config module
    // graph: <1s warm, but the default 12s budget fired under full-suite
    // shard CPU contention.
  }, 45_000);

  it('keeps first-party auth copy aligned with the canonical cross-links', () => {
    expect(authCopy.signUp.start.title).toBe('Continue to Jovie');
    expect(authCopy.signUp.start.actionText).toBe('Have an account?');
    expect(authCopy.signUp.start.actionLink).toBe('Sign in');

    expect(authCopy.signIn.start.title).toBe('Log in to Jovie');
    expect(authCopy.signIn.start.actionText).toBe('Trouble signing in?');
    expect(authCopy.signIn.start.actionLink).toBe('Get help');
  });
});
