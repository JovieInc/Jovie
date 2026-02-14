import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FinalCTASection } from '@/components/home/FinalCTASection';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';

// Feature lists aligned with PLAN_LIMITS in lib/stripe/config.ts
const FREE_FEATURES = [
  'AI-powered personalization',
  'Smart deep links',
  'Auto-sync from Spotify',
  'Basic analytics (7 days)',
  'Up to 100 contacts',
] as const;

const PRO_FEATURES = [
  'All Free features +',
  'Remove Jovie branding',
  'Extended analytics (90 days)',
  'Unlimited contacts',
  'Contact export',
  'Geographic insights',
  'Priority support',
] as const;

const GROWTH_FEATURES = [
  'All Pro features +',
  'Full analytics (1 year)',
  'Automated follow-ups',
  'A/B testing',
  'Meta pixel integration',
  'Custom domain',
] as const;

// SEO Metadata
export const metadata: Metadata = {
  title: `Pricing - ${APP_NAME}`,
  description:
    'Use Jovie for free with unlimited profiles. Upgrade to remove branding, unlock advanced analytics, and export contacts.',
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
      'Use Jovie for free with unlimited profiles. Upgrade for advanced features.',
    url: `${APP_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description:
      'Use Jovie for free with unlimited profiles. Upgrade for advanced features.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Product/Offer JSON-LD Structured Data
const PRICING_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description:
    'Use Jovie for free with unlimited profiles. Upgrade for advanced features.',
  url: `${APP_URL}/pricing`,
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'Product',
          name: `${APP_NAME} Free`,
          description: 'Free for everyone',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
          },
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@type': 'Product',
          name: `${APP_NAME} Pro`,
          description: 'For growing artists',
          offers: {
            '@type': 'Offer',
            price: '39',
            priceCurrency: 'USD',
            priceValidUntil: '2026-12-31',
            availability: 'https://schema.org/InStock',
            billingIncrement: 'P1M',
          },
        },
      },
      {
        '@type': 'ListItem',
        position: 3,
        item: {
          '@type': 'Product',
          name: `${APP_NAME} Growth`,
          description: 'For serious artists',
          offers: {
            '@type': 'Offer',
            price: '99',
            priceCurrency: 'USD',
            priceValidUntil: '2026-12-31',
            availability: 'https://schema.org/InStock',
            billingIncrement: 'P1M',
          },
        },
      },
    ],
  },
});

// Shared styles for consistent structure
const TIER_HEADER_HEIGHT = '148px'; // Consistent height for all tier headers

interface PricingTierProps {
  readonly name: string;
  readonly badge?: string;
  readonly billingLabel: string;
  readonly price: string;
  readonly priceSuffix?: string;
  readonly yearlyPrice?: string;
  readonly buttonLabel: string;
  readonly buttonHref: string;
  readonly buttonVariant: 'primary' | 'secondary';
  readonly features: readonly string[];
  readonly isHighlighted?: boolean;
}

function PricingTier({
  name,
  badge,
  billingLabel,
  price,
  priceSuffix,
  yearlyPrice,
  buttonLabel,
  buttonHref,
  buttonVariant,
  features,
  isHighlighted = false,
}: PricingTierProps) {
  return (
    <div
      className={`flex flex-col p-6 md:p-8 ${isHighlighted ? 'relative z-10 rounded-xl md:rounded-lg md:-my-px' : ''}`}
      style={{
        backgroundColor: isHighlighted
          ? 'var(--linear-bg-surface-1)'
          : 'transparent',
        boxShadow: isHighlighted ? 'var(--linear-shadow-card)' : 'none',
      }}
    >
      {/* Header section - fixed height for alignment */}
      <div style={{ minHeight: TIER_HEADER_HEIGHT }}>
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

        {/* Plan name + badge */}
        <div className='flex items-center gap-2 mb-4 md:mb-6'>
          <span
            style={{
              fontSize: 'var(--linear-h3-size)',
              fontWeight: 'var(--linear-font-weight-bold)',
              color: 'var(--linear-text-primary)',
            }}
          >
            {name}
          </span>
          {badge && (
            <span
              className='px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide'
              style={{
                backgroundColor: 'var(--linear-warning-subtle)',
                color: 'var(--linear-warning)',
              }}
            >
              {badge}
            </span>
          )}
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

        {/* Yearly price - always render container for consistent spacing */}
        <div
          className='mt-2'
          style={{
            fontSize: 'var(--linear-label-size)',
            color: 'var(--linear-text-tertiary)',
            minHeight: '20px',
          }}
        >
          {yearlyPrice || '\u00A0'}
        </div>
      </div>

      {/* CTA Button */}
      <Link
        href={buttonHref}
        className='block w-full text-center mb-6 md:mb-8 transition-opacity hover:opacity-90'
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
              className='shrink-0 mt-0.5'
              style={{
                width: '16px',
                height: '16px',
                color: isHighlighted
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-text-secondary)',
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
  return (
    <div className='min-h-screen'>
      {/* Structured Data for SEO */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: PRICING_SCHEMA }}
      />

      <Container size='lg'>
        <div className='section-spacing-linear'>
          {/* Header */}
          <div className='text-center heading-gap-linear'>
            <h1
              className='text-3xl md:text-5xl lg:text-6xl'
              style={{
                fontWeight: 'var(--linear-font-weight-medium)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: 'var(--linear-text-primary)',
              }}
            >
              Pricing
            </h1>
            <p
              className='mt-4 mx-auto max-w-lg'
              style={{
                fontSize: 'var(--linear-body-lg-size)',
                lineHeight: 'var(--linear-body-lg-leading)',
                color: 'var(--linear-text-secondary)',
              }}
            >
              Use Jovie for free with unlimited profiles. Upgrade to remove
              branding, unlock advanced analytics, and export your contacts.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className='mx-auto max-w-5xl'>
            {/* Desktop: 3 columns, Mobile: stacked cards */}
            <div
              className='grid grid-cols-1 md:grid-cols-3 rounded-xl md:rounded-lg overflow-hidden'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-default)',
              }}
            >
              {/* Free Tier */}
              <div className='border-b md:border-b-0 md:border-r border-[var(--linear-border-default)]'>
                <PricingTier
                  name='Free'
                  billingLabel='Free for everyone'
                  price='$0'
                  buttonLabel='Get started'
                  buttonHref='/signup?plan=free'
                  buttonVariant='secondary'
                  features={FREE_FEATURES}
                />
              </div>

              {/* Pro Tier - Highlighted */}
              <PricingTier
                name='Pro'
                billingLabel='Billed monthly'
                price='$39'
                priceSuffix='/month'
                yearlyPrice='or $348/year (save $120)'
                buttonLabel='Get started'
                buttonHref='/signup?plan=pro'
                buttonVariant='primary'
                features={PRO_FEATURES}
                isHighlighted
              />

              {/* Growth Tier */}
              <div className='border-t md:border-t-0 md:border-l border-[var(--linear-border-default)]'>
                <PricingTier
                  name='Growth'
                  badge='Early Access'
                  billingLabel='Billed monthly'
                  price='$99'
                  priceSuffix='/month'
                  yearlyPrice='or $948/year (save $240)'
                  buttonLabel='Request Early Access'
                  buttonHref='/signup?plan=growth'
                  buttonVariant='secondary'
                  features={GROWTH_FEATURES}
                />
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* CTA Section */}
      <FinalCTASection />
    </div>
  );
}
