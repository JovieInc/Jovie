import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';

// Static feature lists - no need for client-side state
const FREE_FEATURES = [
  'Blazing-fast profiles, SEO-optimized',
  'AI-driven personalization',
  'Smart deep links (/listen, /tip, etc.)',
  'Clean dark/light mode',
  'App deep links (no browser friction)',
  'Basic analytics (7 days)',
  'Contact capture (100 contacts)',
  'Jovie branding on profile',
] as const;

const PRO_FEATURES = [
  'Everything in Free, plus:',
  'Remove Jovie branding',
  'Full analytics (90 days)',
  'Unlimited contacts + export',
  'Geographic & device insights',
  'Priority support',
] as const;

const GROWTH_FEATURES = [
  'Everything in Pro, plus:',
  'Automated follow-ups',
  'A/B testing for headlines & offers',
  'Meta retargeting (Facebook/Instagram)',
  'Smart optimization suggestions',
] as const;

// SEO Metadata
export const metadata: Metadata = {
  title: `Pricing - ${APP_NAME}`,
  description:
    'Find a plan to grow your audience. Jovie supports artists of all sizes with pricing that scales - Free, Pro ($39/mo), and Growth ($99/mo) tiers.',
  keywords: [
    'Jovie pricing',
    'link in bio pricing',
    'artist marketing tools',
    'music promotion pricing',
    'fan engagement platform',
    'artist link tree alternative',
  ],
  openGraph: {
    title: `Pricing - ${APP_NAME}`,
    description:
      'Find a plan to grow your audience. Free, Pro, and Growth tiers available.',
    url: `${APP_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Pricing - ${APP_NAME}`,
    description:
      'Find a plan to grow your audience. Free, Pro, and Growth tiers available.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Product/Offer JSON-LD Structured Data for rich search results
const PRICING_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `Pricing - ${APP_NAME}`,
  description:
    'Find a plan to grow your audience. Jovie supports artists of all sizes with pricing that scales.',
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
          description: 'Everything you need to start. Free forever.',
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
          description: 'Your identity. Your data.',
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
          description: 'Automate. Retarget. Scale.',
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

export default function PricingPage() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0a0a0b]'>
      {/* Structured Data for SEO */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: PRICING_SCHEMA }}
      />

      <Container size='lg'>
        <div className='py-20 sm:py-28'>
          {/* Header */}
          <div className='text-center mb-20'>
            <h1
              className='text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-[1.1]'
              style={{ fontSynthesisWeight: 'none' }}
            >
              Find a plan to grow your audience.
            </h1>
            <p className='mt-6 text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto'>
              Jovie supports artists of all sizes, with pricing that scales.
            </p>
          </div>

          {/* Three-tier pricing grid */}
          <div className='max-w-6xl mx-auto'>
            <div className='grid md:grid-cols-3 gap-6'>
              {/* Free Tier */}
              <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 flex flex-col'>
                <div className='mb-4'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>
                    Free
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Everything you need to start.
                </p>
                <div className='flex items-baseline mb-6'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $0
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    forever
                  </span>
                </div>
                <Link
                  href='/waitlist?plan=free'
                  className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {FREE_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro Tier */}
              <div className='rounded-xl border-2 border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/50 p-8 flex flex-col relative'>
                <div className='mb-4 flex items-center gap-2'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-900 dark:text-white'>
                    Pro
                  </span>
                  <span className='text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'>
                    Most Popular
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Your identity. Your data.
                </p>
                <div className='flex items-baseline mb-2'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $39
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    /month
                  </span>
                </div>
                <p className='text-xs text-neutral-500 dark:text-neutral-400 mb-6'>
                  or $348/year (save 2 months)
                </p>
                <Link
                  href='/waitlist?plan=pro'
                  className='block w-full h-10 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium text-center leading-10 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {PRO_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-900 dark:text-white mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-700 dark:text-neutral-300'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Growth Tier */}
              <div className='rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 flex flex-col'>
                <div className='mb-4 flex items-center gap-2'>
                  <span className='text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>
                    Growth
                  </span>
                  <span className='text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'>
                    Coming Soon
                  </span>
                </div>
                <p className='text-sm text-neutral-600 dark:text-neutral-400 mb-4'>
                  Automate. Retarget. Scale.
                </p>
                <div className='flex items-baseline mb-2'>
                  <span
                    className='text-4xl font-semibold text-neutral-900 dark:text-white'
                    style={{ fontSynthesisWeight: 'none' }}
                  >
                    $99
                  </span>
                  <span className='ml-2 text-neutral-500 dark:text-neutral-400'>
                    /month
                  </span>
                </div>
                <p className='text-xs text-neutral-500 dark:text-neutral-400 mb-6'>
                  or $948/year (save 2 months)
                </p>
                <Link
                  href='/waitlist?plan=growth'
                  className='block w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-medium text-center leading-10 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors mb-6'
                  style={{ fontSynthesisWeight: 'none' }}
                >
                  Join waitlist →
                </Link>
                <ul className='space-y-3 grow'>
                  {GROWTH_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check className='w-4 h-4 text-neutral-400 dark:text-neutral-500 mt-0.5 shrink-0' />
                      <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer note */}
            <p className='mt-8 text-center text-sm text-neutral-400 dark:text-neutral-500'>
              30-day money-back guarantee. Cancel anytime.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
