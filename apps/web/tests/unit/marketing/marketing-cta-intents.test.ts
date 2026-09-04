import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import {
  buildClaimProfileStartHref,
  getClaimProfileIntent,
  MARKETING_CTA_INTENTS,
} from '@/data/marketingCtaIntents';

describe('marketing CTA intent registry', () => {
  it('keeps claim-profile waitlist-first Get started truthful', () => {
    const intent = getClaimProfileIntent();

    expect(intent).toBe(MARKETING_CTA_INTENTS.claimProfile);
    expect(intent.label).toBe('Get started');
    expect(intent.href).toBe(PUBLIC_WAITLIST_URL);
    expect(intent.eventName).toBe('landing_cta_claim_profile');
    expect(intent.support.toLowerCase()).toContain('limited prelaunch access');
  });

  it('restores the open-door artist-profile claim CTA when waitlist is disabled', () => {
    const intent = getClaimProfileIntent(false);

    expect(intent.label).toBe('Claim your profile');
    expect(intent.href).toBe(APP_ROUTES.START);
    expect(intent.support).toBe('Free to start. No credit card.');
    expect(buildClaimProfileStartHref('@river-signal', false)).toBe(
      '/start?starter_prompt=I+want+to+claim+jov.ie%2Friver-signal.&handle=river-signal'
    );
  });

  it('builds handle-aware claim destinations without inventing a second CTA dialect', () => {
    expect(buildClaimProfileStartHref()).toBe(
      MARKETING_CTA_INTENTS.claimProfile.href
    );
    const withHandle = new URL(
      buildClaimProfileStartHref('@river-signal'),
      'https://jov.ie'
    );
    expect(withHandle.origin).toBe('https://jov.ie');
    expect(withHandle.pathname).toBe(APP_ROUTES.WAITLIST);
    expect(withHandle.searchParams.get('handle')).toBe('river-signal');
    expect(withHandle.searchParams.get('starter_prompt')).toContain(
      'jov.ie/river-signal'
    );
  });
});
