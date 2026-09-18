import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildPublicAcquisitionHref,
  getHomepageFrontDoorCtaContract,
  PUBLIC_WAITLIST_URL,
} from '@/data/homepageFrontDoorCta';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { MARKETING_PAGE_CONTRACTS } from '@/data/marketing/pageContracts';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';

describe('public acquisition entry points (JOV-6436)', () => {
  it('keeps waitlist-on marketing CTAs on the same-origin waitlist path', () => {
    const homepage = getHomepageFrontDoorCtaContract(true);
    const claim = getClaimProfileIntent(true);

    expect(PUBLIC_WAITLIST_URL).toBe(APP_ROUTES.WAITLIST);
    expect(homepage.primary).toEqual({
      label: 'Get started',
      href: APP_ROUTES.WAITLIST,
    });
    expect(claim.label).toBe('Get started');
    expect(claim.href).toBe(APP_ROUTES.WAITLIST);
    expect(HOMEPAGE_FRONT_DOOR_CTA.primary).toEqual(homepage.primary);
    expect(
      MARKETING_PAGE_CONTRACTS['(marketing)/artist-profiles/page.tsx']
        .primaryCta.href
    ).toBe(APP_ROUTES.WAITLIST);
  });

  it('keeps waitlist-off CTAs on the open /start acquisition path', () => {
    const homepage = getHomepageFrontDoorCtaContract(false);
    const claim = getClaimProfileIntent(false);

    expect(homepage.primary.href).toBe(APP_ROUTES.START);
    expect(homepage.primary.label).toBe('Claim your free profile');
    expect(claim.href).toBe(APP_ROUTES.START);
    expect(claim.label).toBe('Claim your profile');
  });

  it('builds same-origin acquisition hrefs without leaving the current host', () => {
    expect(buildPublicAcquisitionHref(APP_ROUTES.WAITLIST)).toBe(
      APP_ROUTES.WAITLIST
    );
    expect(
      buildPublicAcquisitionHref(APP_ROUTES.WAITLIST, {
        handle: 'river-signal',
        starter_prompt: '',
      })
    ).toBe(`${APP_ROUTES.WAITLIST}?handle=river-signal`);
    expect(
      buildPublicAcquisitionHref(APP_ROUTES.WAITLIST, {
        handle: 'river-signal',
      }).startsWith('https://')
    ).toBe(false);
  });
});
