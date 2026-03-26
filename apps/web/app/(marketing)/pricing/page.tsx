import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import {
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
} from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

// SEO Metadata
export const metadata: Metadata = {
  title: `Pricing - ${APP_NAME}`,
  description:
    'Start free with unlimited smart links. Upgrade for advanced analytics, fan CRM, and more.',
  keywords: [
    'Jovie pricing',
    'link in bio pricing',
    'artist marketing tools',
    'music promotion pricing',
    'fan engagement platform',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description:
      'Start free with unlimited smart links. Upgrade for advanced analytics, fan CRM, and more.',
    url: `${BASE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description:
      'Start free with unlimited smart links. Upgrade for advanced analytics, fan CRM, and more.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

const growthPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_GROWTH_PLAN === 'true';

// Product/Offer JSON-LD Structured Data — derived from ENTITLEMENT_REGISTRY
const PRICING_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description:
    'Start free with unlimited smart links. Upgrade for advanced analytics, fan CRM, and more.',
  url: `${BASE_URL}/pricing`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: getAllPlanIds()
      .filter(planId => growthPlanEnabled || planId !== 'growth')
      .filter(planId => planId !== 'founding')
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
                priceValidUntil: '2026-12-31',
                billingIncrement: 'P1M',
              }),
              availability: 'https://schema.org/InStock',
            },
          },
        };
      }),
  },
};

interface PricingTierProps {
  readonly name: string;
  readonly billingLabel: string;
  readonly price: string;
  readonly priceSuffix?: string;
  readonly foundingNote?: string;
  readonly buttonLabel: string;
  readonly buttonHref: string;
  readonly buttonVariant: 'primary' | 'secondary';
  readonly features: readonly string[];
  readonly isHighlighted?: boolean;
}

function PricingTier({
  name,
  billingLabel,
  price,
  priceSuffix,
  foundingNote,
  buttonLabel,
  buttonHref,
  buttonVariant,
  features,
  isHighlighted = false,
}: PricingTierProps) {
  return (
    <div
      className='flex flex-col p-6 md:p-8'
      style={{
        backgroundColor: isHighlighted
          ? 'var(--linear-bg-surface-1)'
          : 'transparent',
      }}
    >
      {/* Header section */}
      <div>
        {/* Billing label */}
        <div
          className='mb-3 md:mb-4'
          style={{
            fontSize: 'var(--linear-body-sm-size)',
            color: 'var(--linear-text-secondary)',
          }}
        >
          {billingLabel}
        </div>

        {/* Plan name */}
        <div className='mb-4 md:mb-6'>
          <span
            style={{
              fontSize: 'var(--linear-h3-size)',
              fontWeight: 'var(--linear-font-weight-bold)',
              color: 'var(--linear-text-primary)',
            }}
          >
            {name}
          </span>
        </div>

        {/* Price */}
        <div className='flex items-baseline gap-1'>
          <span
            style={{
              fontSize: 'var(--linear-h2-size)',
              fontWeight: 'var(--linear-font-weight-bold)',
              color: 'var(--linear-text-primary)',
            }}
          >
            {price}
          </span>
          {priceSuffix && (
            <span
              style={{
                fontSize: 'var(--linear-body-sm-size)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              {priceSuffix}
            </span>
          )}
        </div>

        {/* Founding note */}
        {foundingNote && (
          <div
            className='mt-2'
            style={{
              fontSize: 'var(--linear-label-size)',
              color: 'var(--linear-text-tertiary)',
            }}
          >
            {foundingNote}
          </div>
        )}
      </div>

      {/* CTA Button */}
      <Link
        href={buttonHref}
        className='block w-full text-center mt-6 mb-6 md:mt-8 md:mb-8 transition-opacity hover:opacity-90'
        style={{
          fontSize: 'var(--linear-body-sm-size)',
          fontWeight: 'var(--linear-font-weight-medium)',
          height: 'var(--linear-button-height-sm)',
          lineHeight: 'var(--linear-button-height-sm)',
          borderRadius: 'var(--linear-radius-sm)',
          backgroundColor:
            buttonVariant === 'primary'
              ? 'var(--linear-btn-primary-bg)'
              : 'var(--linear-bg-button)',
          color:
            buttonVariant === 'primary'
              ? 'var(--linear-btn-primary-fg)'
              : 'var(--linear-text-primary)',
        }}
      >
        {buttonLabel}
      </Link>

      {/* Features list */}
      <ul className='flex flex-col gap-3'>
        {features.map(feature => (
          <li key={feature} className='flex items-start gap-3'>
            <Check
              aria-label='Included'
              className='shrink-0 mt-0.5'
              style={{
                width: '16px',
                height: '16px',
                color: 'var(--linear-text-secondary)',
              }}
            />
            <span
              style={{
                fontSize: 'var(--linear-body-sm-size)',
                color: 'var(--linear-text-secondary)',
                lineHeight: '1.5',
              }}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  const founding = ENTITLEMENT_REGISTRY.founding;

  return (
    <div className='min-h-screen'>
      {/* Structured Data for SEO */}
      <script type='application/ld+json'>
        {safeJsonLdStringify(PRICING_SCHEMA)}
      </script>

      <MarketingHero variant='centered'>
        <h1 className='marketing-h1-linear text-primary-token'>Pricing</h1>
      </MarketingHero>

      <MarketingContainer width='page'>
        <div className='section-spacing-linear'>
          {/* Pricing Grid */}
          <div className='mx-auto max-w-5xl'>
            <div
              className={`grid grid-cols-1 ${growthPlanEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'} rounded-xl md:rounded-lg overflow-hidden`}
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-default)',
              }}
            >
              {/* Free Tier */}
              <div className='border-b md:border-b-0 md:border-r border-default'>
                <PricingTier
                  name={ENTITLEMENT_REGISTRY.free.marketing.displayName}
                  billingLabel={ENTITLEMENT_REGISTRY.free.marketing.tagline}
                  price='$0'
                  buttonLabel='Get started'
                  buttonHref='/signup?plan=free'
                  buttonVariant='secondary'
                  features={ENTITLEMENT_REGISTRY.free.marketing.features}
                />
              </div>

              {/* Pro Tier - Highlighted */}
              <div
                className={
                  growthPlanEnabled
                    ? 'border-b md:border-b-0 md:border-r border-default'
                    : ''
                }
              >
                <PricingTier
                  name={ENTITLEMENT_REGISTRY.pro.marketing.displayName}
                  billingLabel='Billed monthly'
                  price={`$${ENTITLEMENT_REGISTRY.pro.marketing.price?.monthly ?? 0}`}
                  priceSuffix='/month'
                  foundingNote={`${founding.marketing.displayName}: $${founding.marketing.price?.monthly ?? 0}/mo locked in`}
                  buttonLabel='Get started'
                  buttonHref='/signup?plan=pro'
                  buttonVariant='primary'
                  features={ENTITLEMENT_REGISTRY.pro.marketing.features}
                  isHighlighted
                />
              </div>

              {growthPlanEnabled && (
                <div>
                  <PricingTier
                    name={ENTITLEMENT_REGISTRY.growth.marketing.displayName}
                    billingLabel='Early Access · Billed monthly'
                    price={`$${ENTITLEMENT_REGISTRY.growth.marketing.price?.monthly ?? 0}`}
                    priceSuffix='/month'
                    buttonLabel='Request Early Access'
                    buttonHref='/signup?plan=growth'
                    buttonVariant='secondary'
                    features={ENTITLEMENT_REGISTRY.growth.marketing.features}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Full Feature Comparison Chart */}
          <div className='mt-20'>
            <h2 className='mb-10 text-center text-2xl font-medium tracking-tight text-primary-token md:text-3xl'>
              Compare all features
            </h2>
            <PricingComparisonChart />
          </div>
        </div>
      </MarketingContainer>

      {/* Bottom CTA */}
      <div
        className='py-20 md:py-28'
        style={{ borderTop: '1px solid var(--linear-border-subtle)' }}
      >
        <MarketingContainer width='page'>
          <div className='text-center'>
            <h2
              className='text-2xl font-medium tracking-tight md:text-4xl'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Built for artists. Ready when you are.
            </h2>
            <p
              className='mt-4 mx-auto max-w-md'
              style={{
                fontSize: 'var(--linear-body-size)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              Start free, upgrade anytime. No credit card required.
            </p>
            <div className='mt-8 flex items-center justify-center gap-4'>
              <Link
                href='/signup'
                className='inline-block transition-opacity hover:opacity-90'
                style={{
                  fontSize: 'var(--linear-body-sm-size)',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  height: 'var(--linear-button-height-sm)',
                  lineHeight: 'var(--linear-button-height-sm)',
                  borderRadius: 'var(--linear-radius-sm)',
                  backgroundColor: 'var(--linear-btn-primary-bg)',
                  color: 'var(--linear-btn-primary-fg)',
                  padding: '0 20px',
                }}
              >
                Get started
              </Link>
              <Link
                href='/'
                className='inline-block transition-opacity hover:opacity-90'
                style={{
                  fontSize: 'var(--linear-body-sm-size)',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  height: 'var(--linear-button-height-sm)',
                  lineHeight: 'var(--linear-button-height-sm)',
                  borderRadius: 'var(--linear-radius-sm)',
                  backgroundColor: 'var(--linear-bg-button)',
                  color: 'var(--linear-text-primary)',
                  padding: '0 20px',
                }}
              >
                Learn more
              </Link>
            </div>
          </div>
        </MarketingContainer>
      </div>
    </div>
  );
}
