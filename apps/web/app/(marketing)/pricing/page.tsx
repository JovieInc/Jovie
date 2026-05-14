import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getVisibleMarketingPricingPlans } from '@/data/marketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

const VISIBLE_PRICING_PLANS = getVisibleMarketingPricingPlans();
const VISIBLE_PAID_PLANS = VISIBLE_PRICING_PLANS.filter(
  plan => plan.id !== 'free'
);
const primaryPaidPlanName =
  VISIBLE_PAID_PLANS.length === 1 ? VISIBLE_PAID_PLANS[0]?.name : null;
const accessCopy = primaryPaidPlanName
  ? `${primaryPaidPlanName} opens from the waitlist with the plan request saved.` // copy-lint-allow: waitlist
  : 'Paid plans open from the waitlist with the plan request saved.'; // copy-lint-allow: waitlist
const requestAccessCopy = primaryPaidPlanName
  ? `Claim the profile first. Request ${primaryPaidPlanName} when you want the release system turned on.`
  : 'Claim the profile first. Request a paid plan when you want the release system turned on.';

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
      const price = plan.price === 'Custom' ? '0' : plan.price.replace('$', '');

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
            ...(plan.price !== '$0' &&
              plan.price !== 'Custom' && {
                priceValidUntil: pricingSchemaValidUntil,
                billingIncrement: 'P1M',
              }),
            availability: 'https://schema.org/PreOrder',
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
    <article className='rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6'>
      <p className='text-[12px] font-semibold tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <h2 className='mt-3 text-[1.35rem] font-semibold tracking-[-0.035em] text-primary-token'>
        {headline}
      </h2>
      <p className='mt-3 text-[14px] leading-[1.65] text-secondary-token'>
        {body}
      </p>
    </article>
  );
}

export default function PricingPage() {
  return (
    <MarketingPageShell>
      <script type='application/ld+json'>
        {safeJsonLdStringify(PRICING_SCHEMA)}
      </script>

      <section className='pb-16 pt-[5.9rem] sm:pb-20 sm:pt-[6.4rem] lg:pb-24'>
        <MarketingContainer width='page'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start'>
            <div className='max-w-[33rem]'>
              <h1 className='marketing-h1-linear text-primary-token'>
                Pricing
              </h1>
              <p className='marketing-lead-linear mt-5 max-w-[30rem] text-secondary-token'>
                Artist profiles are free forever. Pro adds the release tools
                when you need them.
              </p>
              {/* copy-lint-allow: waitlist — intentional; describes the paid plan access flow */}
              <p className='mt-6 text-[13px] font-medium tracking-[-0.01em] text-tertiary-token'>
                {accessCopy}
              </p>
              <div className='mt-7 flex flex-wrap items-center gap-3'>
                <Link
                  href={`${APP_ROUTES.SIGNUP}?plan=free`}
                  className='public-action-primary'
                >
                  Claim your profile
                </Link>
                <Link
                  href={APP_ROUTES.ARTIST_PROFILES}
                  className='public-action-secondary'
                >
                  Explore Artist Profiles
                </Link>
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              {STORY_CARDS.map(card => (
                <PricingStoryCard
                  key={card.label}
                  label={card.label}
                  headline={card.headline}
                  body={card.body}
                />
              ))}
            </div>
          </div>

          <div className='mt-12'>
            <MarketingPricingPlans mode='expanded' />
          </div>
        </MarketingContainer>
      </section>

      <section className='border-t border-subtle py-20 md:py-24'>
        <MarketingContainer width='page'>
          <div className='mx-auto max-w-[58rem]'>
            <div className='max-w-[30rem]'>
              <h2 className='text-[clamp(2.15rem,3.6vw,3.25rem)] font-semibold tracking-[-0.04em] text-primary-token'>
                Compare all features
              </h2>
              <p className='mt-4 text-[15px] leading-[1.7] text-secondary-token'>
                See the plan matrix for notifications, analytics, contacts,
                smart links, and release workspace capabilities.
              </p>
            </div>
            <div className='mt-10'>
              <PricingComparisonChart />
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section className='border-t border-subtle py-20 md:py-28'>
        <MarketingContainer width='page'>
          <div className='text-center'>
            <h2 className='text-[clamp(2.1rem,3.6vw,3.25rem)] font-semibold tracking-[-0.04em] text-primary-token'>
              Request Access
            </h2>
            <p className='mx-auto mt-4 max-w-[30rem] text-[15px] leading-[1.7] text-secondary-token'>
              {requestAccessCopy}
            </p>
            <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=free`}
                prefetch={false}
                className='public-action-primary'
              >
                Claim your profile
              </Link>
              <Link
                href={APP_ROUTES.ARTIST_PROFILES}
                prefetch={false}
                className='public-action-secondary'
              >
                Explore Artist Profiles
              </Link>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </MarketingPageShell>
  );
}
