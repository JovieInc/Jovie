import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingPageShell } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import {
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
} from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
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
      'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
    url: `${BASE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description:
      'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

const maxPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';
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
    'Request access to Jovie launch plans for artist profiles, smart links, and audience capture.',
  url: `${BASE_URL}/pricing`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: getAllPlanIds()
      .filter(planId => maxPlanEnabled || planId !== 'max')
      .map((planId, index) => {
        const plan = ENTITLEMENT_REGISTRY[planId];
        const price = plan.marketing.price?.monthly ?? 0;

        return {
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            name: `${APP_NAME} ${plan.marketing.displayName}`,
            description: plan.marketing.tagline,
            offers: {
              '@type': 'Offer',
              price: String(price),
              priceCurrency: 'USD',
              ...(price > 0 && {
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

type VisiblePlanId = 'free' | 'pro' | 'max';

const STORY_CARDS = [
  {
    label: 'Profile',
    headline: 'Artist profiles built to convert.',
    body: 'One profile for streaming, tickets, support, and fan capture without sending people through a maze of tools.',
  },
  {
    label: 'Fan',
    headline: 'Capture every fan. Send them every release automatically.',
    body: 'Turn profile visits, QR scans, and support into an audience you can bring back when the next song or show is live.',
  },
] as const;

function getVisiblePlans(): readonly VisiblePlanId[] {
  return maxPlanEnabled ? ['free', 'pro', 'max'] : ['free', 'pro'];
}

function formatPlanPrice(planId: VisiblePlanId) {
  const price = ENTITLEMENT_REGISTRY[planId].marketing.price?.monthly ?? 0;
  return price === 0 ? '$0' : `$${price}/mo`;
}

function getPlanCta(planId: VisiblePlanId) {
  if (planId === 'free') {
    return {
      href: `${APP_ROUTES.SIGNUP}?plan=free`,
      label: 'Request Access',
      variant: 'secondary' as const,
    };
  }

  if (planId === 'pro') {
    return {
      href: `${APP_ROUTES.SIGNUP}?plan=pro`,
      label: 'Request Access',
      variant: 'primary' as const,
    };
  }

  return {
    href: `${APP_ROUTES.SIGNUP}?plan=max`,
    label: 'Request Access',
    variant: 'secondary' as const,
  };
}

interface PricingStoryCardProps {
  readonly label: string;
  readonly headline: string;
  readonly body: string;
}

function PricingStoryCard({
  label,
  headline,
  body,
}: Readonly<PricingStoryCardProps>) {
  return (
    <article className='rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6'>
      <p className='text-[12px] font-semibold tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <h2 className='mt-3 text-[1.4rem] font-semibold tracking-[-0.04em] text-primary-token'>
        {headline}
      </h2>
      <p className='mt-3 text-[14px] leading-[1.7] text-secondary-token'>
        {body}
      </p>
    </article>
  );
}

interface PricingPlanCardProps {
  readonly planId: VisiblePlanId;
}

function PricingPlanCard({ planId }: Readonly<PricingPlanCardProps>) {
  const plan = ENTITLEMENT_REGISTRY[planId];
  const cta = getPlanCta(planId);

  return (
    <article
      className='rounded-[1.5rem] border p-5 sm:p-6'
      style={{
        borderColor:
          planId === 'pro'
            ? 'color-mix(in oklab, var(--linear-border-default) 75%, white 25%)'
            : 'var(--linear-border-default)',
        backgroundColor:
          planId === 'pro'
            ? 'var(--linear-bg-surface-1)'
            : 'var(--linear-bg-surface-0)',
      }}
    >
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='text-[1.05rem] font-semibold tracking-[-0.03em] text-primary-token'>
            {plan.marketing.displayName}
          </p>
          <p className='mt-2 text-[14px] leading-[1.65] text-secondary-token'>
            {plan.marketing.tagline}
          </p>
        </div>
        {planId === 'pro' ? (
          <span className='rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] text-primary-token'>
            Recommended
          </span>
        ) : null}
      </div>

      <p className='mt-6 text-[2rem] font-semibold tracking-[-0.05em] text-primary-token'>
        {formatPlanPrice(planId)}
      </p>

      <Link
        href={cta.href}
        prefetch={false}
        className={`mt-6 inline-flex w-full items-center justify-center ${
          cta.variant === 'primary'
            ? 'public-action-primary'
            : 'public-action-secondary'
        }`}
      >
        {cta.label}
      </Link>

      <ul className='mt-6 space-y-3'>
        {plan.marketing.features.slice(0, 6).map(feature => (
          <li key={feature} className='flex gap-3'>
            <Check
              aria-hidden='true'
              className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token'
            />
            <span className='text-[14px] leading-[1.6] text-secondary-token'>
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function PricingPage() {
  const visiblePlans = getVisiblePlans();

  return (
    <MarketingPageShell>
      <script type='application/ld+json'>
        {safeJsonLdStringify(PRICING_SCHEMA)}
      </script>

      <section className='pb-16 pt-[5.9rem] sm:pb-20 sm:pt-[6.4rem] lg:pb-24'>
        <MarketingContainer width='page'>
          <div className='grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start'>
            <div className='max-w-[31rem]'>
              <h1 className='marketing-h1-linear text-primary-token'>
                Pricing
              </h1>
              <p className='marketing-lead-linear mt-5 max-w-[28rem] text-secondary-token'>
                Request access to the private launch workspace for artist
                profiles, smart links, and audience capture.
              </p>
              <p className='mt-6 text-[13px] font-medium tracking-[-0.01em] text-tertiary-token'>
                Access opens from the launch waitlist. No credit card required.
              </p>
              <div className='mt-7 flex flex-wrap items-center gap-3'>
                <Link
                  href={`${APP_ROUTES.SIGNUP}?plan=free`}
                  className='public-action-primary'
                >
                  Request Access
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

          <div className='mt-12 md:hidden'>
            <div className='grid gap-4'>
              {visiblePlans.map(planId => (
                <PricingPlanCard key={planId} planId={planId} />
              ))}
            </div>
          </div>

          <div className='mt-12 hidden md:block'>
            <div
              className='overflow-hidden rounded-[1.5rem] border'
              style={{
                borderColor: 'var(--linear-border-default)',
                backgroundColor: 'var(--linear-bg-surface-0)',
              }}
            >
              <div className='overflow-x-auto p-3'>
                <table className='w-full min-w-[860px] border-separate border-spacing-0'>
                  <thead>
                    <tr>
                      <th className='w-[22%] px-6 py-6 text-left align-top' />
                      {visiblePlans.map(planId => {
                        const plan = ENTITLEMENT_REGISTRY[planId];
                        const cta = getPlanCta(planId);

                        return (
                          <th
                            key={planId}
                            className='px-6 py-6 text-left align-top'
                            style={{
                              backgroundColor:
                                planId === 'pro'
                                  ? 'var(--linear-bg-surface-1)'
                                  : 'transparent',
                            }}
                          >
                            <div className='flex items-center gap-2'>
                              <span className='text-[1.05rem] font-semibold tracking-[-0.03em] text-primary-token'>
                                {plan.marketing.displayName}
                              </span>
                              {planId === 'pro' ? (
                                <span className='rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] text-primary-token'>
                                  Recommended
                                </span>
                              ) : null}
                            </div>
                            <p className='mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-primary-token'>
                              {formatPlanPrice(planId)}
                            </p>
                            <p className='mt-2 max-w-[17rem] text-[14px] leading-[1.65] text-secondary-token'>
                              {plan.marketing.tagline}
                            </p>
                            <Link
                              href={cta.href}
                              prefetch={false}
                              className={`mt-5 inline-flex ${
                                cta.variant === 'primary'
                                  ? 'public-action-primary'
                                  : 'public-action-secondary'
                              }`}
                            >
                              {cta.label}
                            </Link>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <PricingTableRow label='Built for'>
                      <PricingTableValue
                        title='Profiles, smart links, and a clean public presence'
                        body='Start with the core release stack and publish one strong profile.'
                      />
                      <PricingTableValue
                        highlighted
                        title='Artists actively releasing and re-engaging fans'
                        body='Turn on notifications, deeper analytics, and CRM workflows.'
                      />
                      {maxPlanEnabled ? (
                        <PricingTableValue
                          title='Teams that need custom support and advanced rollout help'
                          body='White-glove setup for larger launch programs.'
                        />
                      ) : null}
                    </PricingTableRow>

                    <PricingTableRow label='Profile'>
                      <PricingTableValue
                        title='Published artist profile'
                        body='Streaming links, socials, tour dates, and support in one place.'
                      />
                      <PricingTableValue
                        highlighted
                        title='Artist profiles built to convert.'
                        body='Everything in Free plus higher-converting release surfaces and deeper routing control.'
                      />
                      {maxPlanEnabled ? (
                        <PricingTableValue
                          title='Advanced rollout support'
                          body='Custom launch programs and hands-on support for bigger teams.'
                        />
                      ) : null}
                    </PricingTableRow>

                    <PricingTableRow label='Fan'>
                      <PricingTableValue
                        title='Capture every fan.'
                        body='Collect up to 100 contacts and keep the release cycle moving.'
                      />
                      <PricingTableValue
                        highlighted
                        title='Send them every release automatically.'
                        body='Notifications, reactivation, and unlimited contacts stay turned on.'
                      />
                      {maxPlanEnabled ? (
                        <PricingTableValue
                          title='Priority audience ops'
                          body='High-touch support for segmented campaigns, launches, and growth programs.'
                        />
                      ) : null}
                    </PricingTableRow>

                    <PricingTableRow label='Analytics'>
                      <PricingTableValue
                        title='30-day analytics'
                        body='See visits, clicks, and audience signals for recent activity.'
                      />
                      <PricingTableValue
                        highlighted
                        title='180-day analytics + geo insights'
                        body='Understand who engaged, where they were, and what they did next.'
                      />
                      {maxPlanEnabled ? (
                        <PricingTableValue
                          title='Advanced reporting'
                          body='Deeper support for larger teams and rollout visibility.'
                        />
                      ) : null}
                    </PricingTableRow>

                    <PricingTableRow label='Includes'>
                      {visiblePlans.map(planId => (
                        <td
                          key={planId}
                          className='px-6 py-6 align-top'
                          style={{
                            backgroundColor:
                              planId === 'pro'
                                ? 'var(--linear-bg-surface-1)'
                                : 'transparent',
                            borderTop: '1px solid var(--linear-border-subtle)',
                          }}
                        >
                          <ul className='space-y-3'>
                            {ENTITLEMENT_REGISTRY[planId].marketing.features
                              .slice(0, 6)
                              .map(feature => (
                                <li key={feature} className='flex gap-3'>
                                  <Check
                                    aria-hidden='true'
                                    className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token'
                                  />
                                  <span className='text-[14px] leading-[1.6] text-secondary-token'>
                                    {feature}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </td>
                      ))}
                    </PricingTableRow>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section
        className='border-t py-20 md:py-24'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <MarketingContainer width='page'>
          <div className='mx-auto max-w-[58rem]'>
            <div className='max-w-[28rem]'>
              <h2 className='text-[clamp(2.2rem,4vw,3.6rem)] font-semibold tracking-[-0.05em] text-primary-token'>
                Compare all features
              </h2>
              <p className='mt-4 text-[15px] leading-[1.7] text-secondary-token'>
                See the full plan matrix for notifications, analytics, contacts,
                smart links, and everything else in the stack.
              </p>
            </div>
            <div className='mt-10'>
              <PricingComparisonChart />
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section
        className='border-t py-20 md:py-28'
        style={{ borderColor: 'var(--linear-border-subtle)' }}
      >
        <MarketingContainer width='page'>
          <div className='text-center'>
            <h2 className='text-[clamp(2.1rem,4vw,3.5rem)] font-semibold tracking-[-0.05em] text-primary-token'>
              Request Access.
            </h2>
            <p className='mx-auto mt-4 max-w-[30rem] text-[15px] leading-[1.7] text-secondary-token'>
              Build the profile first. Turn on notifications, deeper analytics,
              and reactivation when you want them.
            </p>
            <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=free`}
                prefetch={false}
                className='public-action-primary'
              >
                Request Access
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

interface PricingTableRowProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function PricingTableRow({ label, children }: Readonly<PricingTableRowProps>) {
  return (
    <tr>
      <th
        scope='row'
        className='px-6 py-6 text-left align-top text-[12px] font-semibold tracking-[0.08em] text-tertiary-token'
        style={{ borderTop: '1px solid var(--linear-border-subtle)' }}
      >
        {label}
      </th>
      {children}
    </tr>
  );
}

interface PricingTableValueProps {
  readonly title: string;
  readonly body: string;
  readonly highlighted?: boolean;
}

function PricingTableValue({
  title,
  body,
  highlighted = false,
}: Readonly<PricingTableValueProps>) {
  return (
    <td
      className='px-6 py-6 align-top'
      style={{
        backgroundColor: highlighted
          ? 'var(--linear-bg-surface-1)'
          : 'transparent',
        borderTop: '1px solid var(--linear-border-subtle)',
      }}
    >
      <p className='text-[15px] font-semibold tracking-[-0.02em] text-primary-token'>
        {title}
      </p>
      <p className='mt-2 max-w-[18rem] text-[14px] leading-[1.65] text-secondary-token'>
        {body}
      </p>
    </td>
  );
}
