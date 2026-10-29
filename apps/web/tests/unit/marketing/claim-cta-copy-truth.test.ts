/**
 * Copy-truth guard (JOV-9692): a visitor must see the same price everywhere.
 * Every CTA whose label matches /claim/i must resolve to a free route, or its
 * label must carry the paid plan price from offer-truth. A bare "Claim your
 * profile" pointing at the paid /claim checkout page is a trust break.
 */
import { describe, expect, it } from 'vitest';
import { CANONICAL_PLANS } from '@/constants/plans';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
  getPublicPriceClaims,
} from '@/lib/billing/offer-truth';

interface Cta {
  readonly source: string;
  readonly label: string;
  readonly href: string;
}

const FREE_ROUTE_PREFIXES = [
  APP_ROUTES.START,
  APP_ROUTES.SIGNUP,
  APP_ROUTES.SIGNIN,
] as const;

const PRO = getPublicPriceClaim('pro');
const PRO_PRICE = formatPublicPriceDisplay(PRO);

function isFreeRoute(href: string): boolean {
  const url = new URL(href, 'https://jov.ie');
  if (url.searchParams.get('plan') === 'pro') return false;
  return FREE_ROUTE_PREFIXES.some(
    route => url.pathname === route || url.pathname.startsWith(`${route}/`)
  );
}

function collectCtas(): Cta[] {
  const ctas: Cta[] = [
    ...getPublicPriceClaims().map(c => ({
      source: `offer-truth:${c.plan}`,
      label: c.ctaLabel,
      href: c.ctaHref,
    })),
    ...CANONICAL_PLANS.map(p => ({
      source: `plans:${p.id}`,
      label: p.ctaLabel,
      href: p.signupHref,
    })),
    ...MARKETING_PRICING_PLANS.map(p => ({
      source: `pricing:${p.id}`,
      label: p.ctaLabel,
      href: p.ctaHref,
    })),
    {
      source: 'cta-intent:claimProfile',
      label: MARKETING_CTA_INTENTS.claimProfile.label,
      href: MARKETING_CTA_INTENTS.claimProfile.href,
    },
    {
      source: 'front-door:primary',
      label: HOMEPAGE_FRONT_DOOR_CTA.primary.label,
      href: HOMEPAGE_FRONT_DOOR_CTA.primary.href,
    },
  ];
  return ctas;
}

describe('claim CTA copy truth (JOV-9692)', () => {
  const claimCtas = collectCtas().filter(c => /claim/i.test(c.label));

  it('finds claim CTAs to check', () => {
    expect(claimCtas.length).toBeGreaterThan(0);
  });

  it.each(claimCtas)(
    '$source "$label" -> $href is a free route or carries the price',
    ({ label, href }) => {
      expect(isFreeRoute(href) || label.includes(PRO_PRICE)).toBe(true);
    }
  );

  it('never sends a bare claim label to the paid /claim page', () => {
    for (const cta of collectCtas()) {
      if (new URL(cta.href, 'https://jov.ie').pathname === APP_ROUTES.CLAIM) {
        expect(cta.label).toContain(PRO_PRICE);
        expect(cta.label).toContain(PRO.displayName);
      }
    }
  });

  it('paid pro CTA label is plan plus price from offer-truth', () => {
    expect(PRO.ctaLabel).toBe(`Start ${PRO.displayName}, ${PRO_PRICE}`);
  });

  it('homepage "free" offer headline only appears with a free plan and free CTA', () => {
    if (/free/i.test(HOMEPAGE_COPY.offer.headline)) {
      expect(HOMEPAGE_COPY.offer.plan).toBe('free');
      expect(isFreeRoute(getPublicPriceClaim('free').ctaHref)).toBe(true);
      expect(isFreeRoute(MARKETING_CTA_INTENTS.claimProfile.href)).toBe(true);
    }
  });
});
