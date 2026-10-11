import type { Metadata } from 'next';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { VisibilityAuditOffer } from '@/components/features/visibility-audit/VisibilityAuditOffer';
import { PricingRecipeBody } from '@/components/organisms/PricingRecipeBody';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  getVisibleMarketingPricingPlans,
  type MarketingPricingPlan,
} from '@/data/marketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const VISIBLE_PRICING_PLANS = getVisibleMarketingPricingPlans();
const PRO_MONTHLY_PRICE = `${getPublicPriceClaim('pro').priceLabel}/month`;
const PRICING_OG_IMAGE = `${BASE_URL}/og/default.png`;
const PRICING_TITLE = `Pricing | ${APP_NAME}`;
const requestAccessCopy = `Artist Presence is ${PRO_MONTHLY_PRICE} with limited access. Request access.`;

export const metadata: Metadata = {
  title: PRICING_TITLE,
  description: `Jovie profiles are free forever. Artist Presence is ${PRO_MONTHLY_PRICE} with limited access.`,
  keywords: [
    'Jovie pricing',
    'Jovie profile pricing',
    'creator marketing tools',
    'audience engagement pricing',
    'link in bio platform pricing',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description: `Jovie profiles are free forever. Artist Presence is ${PRO_MONTHLY_PRICE} with limited access.`,
    url: `${BASE_URL}/pricing`,
    siteName: APP_NAME,
    type: 'website',
    images: [
      { url: PRICING_OG_IMAGE, width: 1200, height: 630, alt: PRICING_TITLE },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description: `Jovie profiles are free forever. Artist Presence is ${PRO_MONTHLY_PRICE} with limited access.`,
    images: [PRICING_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const pricingSchemaValidUntil = new Date(
  Date.UTC(new Date().getUTCFullYear() + 1, 11, 31)
)
  .toISOString()
  .slice(0, 10);

/** Offer.url must be an absolute http(s) URL; mailto CTAs point at /pricing. */
function offerUrl(ctaHref: string): string {
  if (ctaHref.startsWith('/')) return new URL(ctaHref, BASE_URL).toString();
  if (ctaHref.startsWith('mailto:')) return `${BASE_URL}/pricing`;
  return ctaHref;
}

function getPublicOfferSchema(plan: MarketingPricingPlan) {
  const claim = getPublicPriceClaim(plan.id);
  if (claim.priceUsd === null) {
    return {
      '@type': 'Offer',
      url: offerUrl(claim.ctaHref),
      availability: 'https://schema.org/LimitedAvailability',
    };
  }

  return {
    '@type': 'Offer',
    price: String(claim.priceUsd),
    priceCurrency: 'USD',
    url: offerUrl(claim.ctaHref),
    ...(claim.priceUsd > 0 && {
      priceValidUntil: pricingSchemaValidUntil,
      billingIncrement: 'P1M',
    }),
    availability: claim.selfService
      ? 'https://schema.org/InStock'
      : 'https://schema.org/LimitedAvailability',
  };
}

const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description: `Jovie profiles are free forever. Artist Presence is ${PRO_MONTHLY_PRICE} with limited access.`,
  url: `${BASE_URL}/pricing`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: VISIBLE_PRICING_PLANS.map((plan, index) => {
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: `${APP_NAME} ${plan.name}`,
          description: plan.body,
          offers: getPublicOfferSchema(plan),
        },
      };
    }),
  },
};

export default function PricingPage() {
  return (
    <PricingRecipeBody
      requestAccessCopy={requestAccessCopy}
      structuredData={
        <script type='application/ld+json'>
          {safeJsonLdStringify(PRICING_SCHEMA)}
        </script>
      }
      plans={
        <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
      }
      auditOffer={<VisibilityAuditOffer />}
      comparisonChart={<PricingComparisonChart />}
    />
  );
}
