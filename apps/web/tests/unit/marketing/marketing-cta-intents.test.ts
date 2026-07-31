import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildClaimProfileStartHref,
  getClaimProfileIntent,
  MARKETING_CTA_INTENTS,
} from '@/data/marketingCtaIntents';

describe('marketing CTA intent registry', () => {
  it('keeps claim-profile label, start route, event, and free-to-start support truthful', () => {
    const intent = getClaimProfileIntent();

    expect(intent).toBe(MARKETING_CTA_INTENTS.claimProfile);
    expect(intent.label).toBe('Claim your profile');
    expect(intent.href.startsWith(APP_ROUTES.START)).toBe(true);
    expect(intent.eventName).toBe('landing_cta_claim_profile');
    expect(intent.support.toLowerCase()).toContain('free to start');
  });

  it('builds handle-aware claim destinations without inventing a second CTA dialect', () => {
    expect(buildClaimProfileStartHref()).toBe(
      MARKETING_CTA_INTENTS.claimProfile.href
    );
    const withHandle = new URL(
      buildClaimProfileStartHref('@river-signal'),
      'https://jov.ie'
    );
    expect(withHandle.pathname).toBe(APP_ROUTES.START);
    expect(withHandle.searchParams.get('handle')).toBe('river-signal');
    expect(withHandle.searchParams.get('starter_prompt')).toContain(
      'jov.ie/river-signal'
    );
  });
});
