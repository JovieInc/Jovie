import type { Metadata } from 'next';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingRecipeBody } from '@/components/organisms/PricingRecipeBody';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  getVisibleMarketingPricingPlans,
  type MarketingPricingPlan,
} from '@/data/marketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const VISIBLE_PRICING_PLANS = getVisibleMarketingPricingPlans();
const VISIBLE_PAID_PLANS = VISIBLE_PRICING_PLANS.filter(
  plan => plan.id !== 'free'
);
const primaryPaidPlanName =
  VISIBLE_PAID_PLANS.length === 1 ? VISIBLE_PAID_PLANS[0]?.name : null;
const requestAccessCopy = primaryPaidPlanName
  ? `Claim the profile first. Choose ${primaryPaidPlanName} when you want the release system turned on.`
  : 'Claim the profile first. Choose a paid plan when you want the release system turned on.';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Artist profiles are free forever. Pro adds Jovie release tools when you need them.',
  keywords: [
    'Jovie pricing',
    'artist profile pricing',
    'music marketing tools',
    'fan engagement pricing',
    'music release platform pricing',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description:
      'Artist profiles are free forever. Pro adds Jovie release tools when you need them.',
    url: `${BASE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description:
      'Artist profiles are free forever. Pro adds Jovie release tools when you need them.',
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

function getPriceValue(plan: MarketingPricingPlan): string {
  return plan.price.replace('$', '');
}

const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description:
    'Artist profiles are free forever. Pro adds Jovie release tools when you need them.',
  url: `${BASE_URL}/pricing`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: VISIBLE_PRICING_PLANS.map((plan, index) => {
      const price = getPriceValue(plan);

      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: `${APP_NAME} ${plan.name}`,
          description: plan.body,
          offers: {
            '@type': 'Offer',
            price,
            priceCurrency: 'USD',
            ...(plan.price !== '$0' && {
              priceValidUntil: pricingSchemaValidUntil,
              billingIncrement: 'P1M',
            }),
            availability: 'https://schema.org/InStock',
          },
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
      plans={<MarketingPricingPlans ctaVariant='secondary' mode='expanded' />}
      comparisonChart={<PricingComparisonChart />}
    />
  );
}
