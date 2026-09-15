import type { Metadata } from 'next';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingRecipeBody } from '@/components/organisms/PricingRecipeBody';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  getVisibleMarketingPricingPlans,
  PRICING_REQUEST_ACCESS_COPY,
  PUBLIC_PRICING_DESCRIPTION,
} from '@/data/marketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const VISIBLE_PRICING_PLANS = getVisibleMarketingPricingPlans();
const requestAccessCopy = PRICING_REQUEST_ACCESS_COPY;

export const metadata: Metadata = {
  title: 'Pricing',
  description: PUBLIC_PRICING_DESCRIPTION,
  keywords: [
    'Jovie pricing',
    'artist profile pricing',
    'music marketing tools',
    'fan engagement pricing',
    'music release platform pricing',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description: PUBLIC_PRICING_DESCRIPTION,
    url: `${BASE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description: PUBLIC_PRICING_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description: PUBLIC_PRICING_DESCRIPTION,
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
