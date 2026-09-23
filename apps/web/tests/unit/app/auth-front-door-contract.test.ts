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
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

describe('auth front-door contract', () => {
  it('keeps waitlist-on homepage CTAs in request-access mode', () => {
    const contract = getHomepageFrontDoorCtaContract(true);

    expect(PUBLIC_WAITLIST_URL).toBe(APP_ROUTES.SIGNUP);
    expect(contract.primary).toEqual({
      label: 'Request access',
      href: APP_ROUTES.SIGNUP,
    });
    expect(contract.primary.href).not.toBe(APP_ROUTES.WAITLIST);
    expect(contract.secondary).toBeNull();
    expect(contract.fallbackSupport).toBe(
      'Limited prelaunch access. We will email when you are in.'
    );
  });

  it('keeps waitlist-off homepage CTAs in open-signup mode', () => {
    const contract = getHomepageFrontDoorCtaContract(false);

    expect(contract.primary).toEqual({
      label: 'Claim your free profile',
      href: APP_ROUTES.START,
    });
    expect(contract.secondary).toEqual({
      label: 'See a live profile',
      href: TIM_WHITE_PROFILE.publicProfilePath,
    });
    expect(contract.fallbackSupport).toBe('Free forever. No credit card.');
  });

  it('keeps free acquisition on signup and Pro on approved request-access routing', () => {
    expect(HOMEPAGE_FRONT_DOOR_CTA.primary.href).toBe(APP_ROUTES.SIGNUP);
    expect(MARKETING_CTA_INTENTS.claimProfile.href).toBe(APP_ROUTES.SIGNUP);
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'free')?.ctaHref
    ).toBe(`${APP_ROUTES.SIGNUP}?plan=free`);
    expect(
      MARKETING_PRICING_PLANS.find(plan => plan.id === 'pro')?.ctaHref
    ).toBe(APP_ROUTES.WAITLIST);
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
  });

  it('keeps first-party auth copy aligned with the canonical cross-links', () => {
    expect(authCopy.signUp.start.title).toBe('Continue to Jovie');
    expect(authCopy.signUp.start.actionText).toBe('Have an account?');
    expect(authCopy.signUp.start.actionLink).toBe('Sign in');

    expect(authCopy.signIn.start.title).toBe('Log in to Jovie');
    expect(authCopy.signIn.start.actionText).toBe('Trouble signing in?');
    expect(authCopy.signIn.start.actionLink).toBe('Get help');
  });
});
