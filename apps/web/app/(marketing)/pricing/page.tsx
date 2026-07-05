import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
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

const STORY_CARDS = [
  {
    label: 'Profile',
    headline: 'Artist profiles built to convert',
    body: 'One public fan path for streaming, tickets, support, and capture.',
  },
  {
    label: 'Fan',
    headline: 'Capture fans once. Bring them back automatically.',
    body: 'Turn profile visits and QR scans into an audience for every drop.',
  },
] as const;

function PricingStoryCard({
  label,
  headline,
  body,
}: Readonly<{
  label: string;
  headline: string;
  body: string;
}>) {
  return (
    <article className='system-b-pricing-story-card'>
      <p className='system-b-pricing-story-label'>{label}</p>
      <h2 className='system-b-pricing-story-title'>{headline}</h2>
      <p className='system-b-pricing-story-body'>{body}</p>
    </article>
  );
}

export default function PricingPage() {
  return (
    <MarketingPageShell className='system-b-pricing-page'>
      <script type='application/ld+json'>
        {safeJsonLdStringify(PRICING_SCHEMA)}
      </script>

      <MarketingHero
        className='system-b-pricing-hero'
        headingId='pricing-hero-heading'
        headline='Pricing'
        subtitle='Artist profiles are free forever. Pro adds the release tools when you need them.'
        primaryCta={{
          label: 'Claim your profile',
          href: `${APP_ROUTES.SIGNUP}?plan=free`,
        }}
        secondaryCta={{
          label: 'Explore Artist Profiles',
          href: APP_ROUTES.ARTIST_PROFILES,
        }}
        media={
          <div className='system-b-pricing-story-grid'>
            {STORY_CARDS.map(card => (
              <PricingStoryCard
                key={card.label}
                label={card.label}
                headline={card.headline}
                body={card.body}
              />
            ))}
          </div>
        }
      />

      <section aria-label='Plans' className='system-b-pricing-section'>
        <MarketingContainer width='page'>
          <div className='system-b-pricing-plans'>
            <MarketingPricingPlans ctaVariant='secondary' mode='expanded' />
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='pricing-compare-heading'
        className='system-b-pricing-section'
      >
        <MarketingContainer width='page'>
          <div className='system-b-pricing-section-inner'>
            <div className='system-b-pricing-section-copy'>
              <h2
                id='pricing-compare-heading'
                className='system-b-pricing-section-title'
              >
                Compare all features
              </h2>
              <p className='system-b-pricing-section-body'>
                See the plan matrix for notifications, analytics, contacts,
                smart links, and release workspace capabilities.
              </p>
            </div>
            <div className='system-b-pricing-chart-wrap'>
              <PricingComparisonChart />
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='pricing-get-started-heading'
        className='system-b-pricing-final'
      >
        <MarketingContainer width='page'>
          <div>
            <h2
              id='pricing-get-started-heading'
              className='system-b-pricing-section-title'
            >
              Get Started
            </h2>
            <p className='system-b-pricing-final-copy'>{requestAccessCopy}</p>
            <div className='system-b-pricing-actions system-b-pricing-actions--center'>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=free`}
                prefetch={false}
                className='system-b-pricing-secondary-link'
              >
                Claim your profile
              </Link>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=pro`}
                prefetch={false}
                className='system-b-pricing-secondary-link'
              >
                Start Pro trial
              </Link>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}
