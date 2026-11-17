import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/billing/offer-truth';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  buildProofClaimHref,
  getProofClaimOffer,
  hasProofClaimCampaign,
  isProofClaimFunnelEvent,
  isProofProfileHandle,
  PROOF_CLAIM_CAMPAIGN_KEY,
  PROOF_CLAIM_FUNNEL_EVENTS,
  PROOF_CLAIM_STARTER_PROMPT,
  PROOF_CLAIM_VARIANT_ID,
  PROOF_PROFILE,
  proofClaimAttribution,
  queryProofClaimFunnel,
  resolveProofClaimCta,
} from './proof-claim-funnel';

describe('proof-to-claim funnel contract (JOV-6440)', () => {
  it('binds the M1 proof account to the live Tim White profile', () => {
    expect(PROOF_PROFILE.handle).toBe(TIM_WHITE_PROFILE.publicProfileHandle);
    expect(isProofProfileHandle('tim')).toBe(true);
    expect(isProofProfileHandle('@Tim')).toBe(true);
    expect(isProofProfileHandle('timwhite')).toBe(false);
    expect(isProofProfileHandle(null)).toBe(false);
  });

  it('locks Artist Presence at $12/mo', () => {
    expect(getProofClaimOffer()).toEqual({
      product: 'Artist Presence',
      monthlyUsd: 12,
      currency: 'usd',
      interval: 'month',
    });
    expect(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd).toBe(12);
  });

  it('routes the open door through the same qualify chat before Pro', () => {
    const href = buildProofClaimHref();
    expect(href.startsWith(`${APP_ROUTES.START}?`)).toBe(true);
    expect(href).toContain(`campaign=${PROOF_CLAIM_CAMPAIGN_KEY}`);
    expect(href).not.toContain(APP_ROUTES.SIGNUP);
    expect(resolveProofClaimCta().href).toBe(href);
    expect(
      new URL(href, 'https://jov.ie').searchParams.get('starter_prompt')
    ).toBe(PROOF_CLAIM_STARTER_PROMPT);
    expect(href).not.toContain(APP_ROUTES.WAITLIST);
    expect(href).not.toContain('/tim/claim');
    expect(resolveProofClaimCta().label).toBe('Get yours');
    expect(resolveProofClaimCta().limited).toBe(false);
    expect(resolveProofClaimCta().note).toContain('$12/mo');
  });

  it('keeps funnel event names stable and queryable', () => {
    expect(PROOF_CLAIM_FUNNEL_EVENTS).toEqual({
      PROOF_VIEWED: 'proof_viewed',
      CLAIM_STARTED: 'claim_started',
      CHECKOUT: 'checkout',
      ACTIVATION: 'activation',
    });
    expect(isProofClaimFunnelEvent('proof_viewed')).toBe(true);
    expect(isProofClaimFunnelEvent('profile_view')).toBe(false);
    expect(proofClaimAttribution()).toMatchObject({
      campaignKey: PROOF_CLAIM_CAMPAIGN_KEY,
      variantKey: PROOF_CLAIM_VARIANT_ID,
    });
    expect(hasProofClaimCampaign('proof-to-claim')).toBe(true);
  });

  it('computes conversion from proof_viewed through activation', () => {
    const report = queryProofClaimFunnel([
      { eventType: 'proof_viewed' },
      { eventType: 'proof_viewed' },
      { eventType: 'claim_started' },
      { eventType: 'checkout' },
      { eventType: 'paid_converted' },
    ]);
    expect(report.stages).toEqual({
      proofViewed: 2,
      claimStarted: 1,
      checkout: 1,
      activation: 1,
    });
    expect(report.rates).toEqual({
      viewToClaim: 0.5,
      claimToCheckout: 1,
      checkoutToActivation: 1,
    });
  });

  it('returns null rates when a stage has no denominator', () => {
    expect(queryProofClaimFunnel([]).rates).toEqual({
      viewToClaim: null,
      claimToCheckout: null,
      checkoutToActivation: null,
    });
  });

  it('keeps the open proof claim without rewriting the homepage (HOLD #17156)', () => {
    expect(resolveProofClaimCta().label).toBe('Get yours');
    const homepage = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../app/(home)/page.tsx'
      ),
      'utf8'
    );
    expect(homepage).not.toContain('proof-to-claim');
    expect(homepage).not.toContain('resolveProofClaimCta');
  });
});
