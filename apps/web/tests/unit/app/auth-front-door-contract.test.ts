import { describe, expect, it } from 'vitest';
import { authCopy } from '@/components/providers/auth-copy';
import { APP_ROUTES } from '@/constants/routes';
import {
  getHomepageFrontDoorCtaContract,
  PUBLIC_WAITLIST_URL,
} from '@/data/homepageFrontDoorCta';

describe('auth front-door contract', () => {
  it('keeps waitlist-on homepage CTAs in request-access mode', () => {
    const contract = getHomepageFrontDoorCtaContract(true);

    expect(contract.primary).toEqual({
      label: 'Get started',
      href: PUBLIC_WAITLIST_URL,
    });
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
      href: APP_ROUTES.ARTIST_PROFILES,
    });
    expect(contract.fallbackSupport).toBe('Free forever. No credit card.');
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
