import type { Metadata } from 'next';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
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
const requestAccessCopy = `Artist Visibility Pro is ${PRO_MONTHLY_PRICE} with limited access. Request access.`;

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Artist profiles are free forever. Artist Visibility Pro is ${PRO_MONTHLY_PRICE} with limited access.`,
  keywords: [
    'Jovie pricing',
    'artist profile pricing',
    'music marketing tools',
    'fan engagement pricing',
    'music release platform pricing',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description: `Artist profiles are free forever. Artist Visibility Pro is ${PRO_MONTHLY_PRICE} with limited access.`,
    url: `${BASE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description: `Artist profiles are free forever. Artist Visibility Pro is ${PRO_MONTHLY_PRICE} with limited access.`,
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

function getPublicOfferSchema(plan: MarketingPricingPlan) {
  const claim = getPublicPriceClaim(plan.id);
  if (claim.priceUsd === null) {
    return {
      '@type': 'Offer',
      url: claim.ctaHref,
      availability: 'https://schema.org/LimitedAvailability',
    };
  }

  return {
    '@type': 'Offer',
    price: String(claim.priceUsd),
    priceCurrency: 'USD',
    url: claim.ctaHref,
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
  description: `Artist profiles are free forever. Artist Visibility Pro is ${PRO_MONTHLY_PRICE} with limited access.`,
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
      comparisonChart={<PricingComparisonChart />}
    />
  );
}
