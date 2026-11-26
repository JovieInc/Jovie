/**
 * Executable guard for LESSONS fingerprint:
 * "Never link to `/claim` from CTAs"
 *
 * Front-door claim CTAs must not land on bare `/claim`, `/register`, or
 * `/waitlist`. Paid Pro may use `/claim?plan=pro` when the label carries price
 * (JOV-9692 copy-truth).
 */
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';

const FORBIDDEN_SIGNUP_PATHS = new Set([
  APP_ROUTES.CLAIM,
  '/register',
  '/waitlist',
]);

function pathnameOf(href: string): string {
  return new URL(href, 'https://jov.ie').pathname.replace(/\/$/u, '') || '/';
}

describe('marketing signup CTA routes', () => {
  it('keeps the front-door claim-profile intent off bare /claim, /register, and /waitlist', () => {
    const path = pathnameOf(MARKETING_CTA_INTENTS.claimProfile.href);
    expect(FORBIDDEN_SIGNUP_PATHS.has(path)).toBe(false);
    expect(path).toBe(APP_ROUTES.START);
  });

  it('keeps free public pricing CTAs off the paid /claim checkout path', () => {
    const free = getPublicPriceClaim('free');
    expect(pathnameOf(free.ctaHref)).not.toBe(APP_ROUTES.CLAIM);
    const freePlan = MARKETING_PRICING_PLANS.find(plan => plan.id === 'free');
    expect(freePlan).toBeDefined();
    expect(pathnameOf(freePlan!.ctaHref)).not.toBe(APP_ROUTES.CLAIM);
  });

  it('allows paid Pro /claim only with an explicit plan query', () => {
    const pro = getPublicPriceClaim('pro');
    const url = new URL(pro.ctaHref, 'https://jov.ie');
    expect(url.pathname).toBe(APP_ROUTES.CLAIM);
    expect(url.searchParams.get('plan')).toBe('pro');
  });
});
