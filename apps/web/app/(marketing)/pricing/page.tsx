import { Check, Shield, Zap } from 'lucide-react';
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

// FAQ data for objection handling
const FAQ_ITEMS = [
  {
    question: 'Can I switch plans later?',
    answer:
      'Yes! Upgrade or downgrade anytime. Changes take effect immediately, and we prorate any payments.',
  },
  {
    question: 'What happens if I cancel?',
    answer:
      "Your profile stays live on the Free plan. You won't lose any data or your handle - you just lose Pro/Growth features.",
  },
  {
    question: 'Do you offer annual billing?',
    answer:
      'Yes! Save 2 months with annual billing. Pay $348/year for Pro (instead of $468) or $948/year for Growth (instead of $1,188).',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use bank-level encryption, and your fan data is never sold or shared with third parties.',
  },
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
    <div className='min-h-screen bg-base'>
      {/* Structured Data for SEO */}
      <script
        type='application/ld+json'
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD schema
        dangerouslySetInnerHTML={{ __html: PRICING_SCHEMA }}
      />

      <Container size='lg'>
        <div className='py-20 sm:py-28'>
          {/* Header - Linear style: 64px/510 weight/tight letter-spacing */}
          <div className='text-center mb-16'>
            <h1
              className='text-primary-token'
              style={{
                fontSize: '64px',
                fontWeight: 510,
                lineHeight: '67.84px',
                letterSpacing: '-1.408px',
                fontSynthesisWeight: 'none',
              }}
            >
              Turn listeners into superfans.
            </h1>
            <p
              className='mt-6 mx-auto'
              style={{
                fontSize: '17px',
                fontWeight: 400,
                lineHeight: '27.2px',
                color: 'rgb(138, 143, 152)',
                maxWidth: '600px',
              }}
            >
              The link-in-bio built for musicians. Own your audience data,
              automate fan engagement, and grow your career.
            </p>
          </div>

          {/* Three-tier pricing grid - Linear style with outer wrapper */}
          <div
            className='mx-auto'
            style={{ maxWidth: '1024px', padding: '0 24px' }}
          >
            {/* Outer grid wrapper - Linear style: dark bg, border, rounded */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                backgroundColor: 'rgb(15, 16, 17)',
                border: '1px solid rgb(32, 33, 34)',
                borderRadius: '12px',
                overflow: 'visible',
              }}
            >
              {/* Free Tier - with right separator border */}
              <section
                className='flex flex-col'
                style={{
                  padding: '24px',
                  borderRight: '1px solid rgb(32, 33, 34)',
                }}
              >
                <div className='mb-4'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '24px',
                      fontWeight: 590,
                      lineHeight: '31.92px',
                      letterSpacing: '-0.288px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    Free
                  </span>
                </div>
                <p
                  className='mb-4'
                  style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                >
                  Everything you need to start.
                </p>
                <div className='flex items-baseline mb-6'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '36px',
                      fontWeight: 590,
                      letterSpacing: '-0.5px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    $0
                  </span>
                  <span
                    className='ml-2'
                    style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                  >
                    forever
                  </span>
                </div>
                <Link
                  href='/waitlist?plan=free'
                  className='block w-full text-primary-token text-center hover:opacity-90 transition-opacity mb-6'
                  style={{
                    fontSize: '15px',
                    fontWeight: 510,
                    height: '40px',
                    lineHeight: '40px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    backgroundColor: 'rgb(40, 40, 44)',
                    fontSynthesisWeight: 'none',
                  }}
                >
                  Start free →
                </Link>
                <ul className='space-y-3 grow'>
                  {FREE_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check
                        className='w-4 h-4 mt-0.5 shrink-0'
                        style={{ color: 'rgb(138, 143, 152)' }}
                      />
                      <span
                        style={{
                          fontSize: '14px',
                          color: 'rgb(138, 143, 152)',
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Pro Tier - Featured card with own styling */}
              <section
                className='flex flex-col relative'
                style={{
                  padding: '39px 24px 24px',
                  backgroundColor: 'rgb(20, 21, 22)',
                  border: '1px solid rgb(32, 33, 34)',
                  borderRadius: '12px',
                  boxShadow: 'rgba(0, 0, 0, 0.2) 0px 4px 24px 0px',
                  margin: '-1px',
                }}
              >
                {/* Most Popular badge */}
                <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                  <span
                    className='inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs'
                    style={{
                      backgroundColor: 'rgb(99, 102, 241)',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  >
                    <Zap className='w-3 h-3' />
                    Most Popular
                  </span>
                </div>
                <div className='mb-4'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '24px',
                      fontWeight: 590,
                      lineHeight: '31.92px',
                      letterSpacing: '-0.288px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    Pro
                  </span>
                </div>
                <p
                  className='mb-4'
                  style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                >
                  Your identity. Your data.
                </p>
                <div className='flex items-baseline mb-2'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '36px',
                      fontWeight: 590,
                      letterSpacing: '-0.5px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    $39
                  </span>
                  <span
                    className='ml-2'
                    style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                  >
                    /month
                  </span>
                </div>
                <p
                  className='mb-6'
                  style={{ fontSize: '12px', color: 'rgb(34, 197, 94)' }}
                >
                  or $348/year (save 2 months)
                </p>
                <Link
                  href='/waitlist?plan=pro'
                  className='block w-full text-center hover:opacity-90 transition-opacity mb-6'
                  style={{
                    fontSize: '15px',
                    fontWeight: 510,
                    height: '40px',
                    lineHeight: '40px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    backgroundColor: 'rgb(99, 102, 241)',
                    color: 'white',
                    fontSynthesisWeight: 'none',
                  }}
                >
                  Get Pro access →
                </Link>
                <ul className='space-y-3 grow'>
                  {PRO_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check
                        className='w-4 h-4 mt-0.5 shrink-0'
                        style={{ color: 'rgb(247, 248, 248)' }}
                      />
                      <span
                        style={{
                          fontSize: '14px',
                          color: 'rgb(138, 143, 152)',
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Growth Tier - with left separator border */}
              <section
                className='flex flex-col'
                style={{
                  padding: '24px',
                  borderLeft: '1px solid rgb(32, 33, 34)',
                }}
              >
                <div className='mb-4 flex items-center gap-2'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '24px',
                      fontWeight: 590,
                      lineHeight: '31.92px',
                      letterSpacing: '-0.288px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    Growth
                  </span>
                  <span
                    className='px-2 py-0.5 rounded-full'
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      backgroundColor: 'rgba(251, 191, 36, 0.15)',
                      color: 'rgb(251, 191, 36)',
                    }}
                  >
                    Coming Soon
                  </span>
                </div>
                <p
                  className='mb-4'
                  style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                >
                  Automate. Retarget. Scale.
                </p>
                <div className='flex items-baseline mb-2'>
                  <span
                    className='text-primary-token'
                    style={{
                      fontSize: '36px',
                      fontWeight: 590,
                      letterSpacing: '-0.5px',
                      fontSynthesisWeight: 'none',
                    }}
                  >
                    $99
                  </span>
                  <span
                    className='ml-2'
                    style={{ fontSize: '14px', color: 'rgb(138, 143, 152)' }}
                  >
                    /month
                  </span>
                </div>
                <p
                  className='mb-6'
                  style={{ fontSize: '12px', color: 'rgb(34, 197, 94)' }}
                >
                  or $948/year (save 2 months)
                </p>
                <Link
                  href='/waitlist?plan=growth'
                  className='block w-full text-primary-token text-center hover:opacity-90 transition-opacity mb-6'
                  style={{
                    fontSize: '15px',
                    fontWeight: 510,
                    height: '40px',
                    lineHeight: '40px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    backgroundColor: 'rgb(40, 40, 44)',
                    fontSynthesisWeight: 'none',
                  }}
                >
                  Get Growth access →
                </Link>
                <ul className='space-y-3 grow'>
                  {GROWTH_FEATURES.map(feature => (
                    <li key={feature} className='flex items-start gap-3'>
                      <Check
                        className='w-4 h-4 mt-0.5 shrink-0'
                        style={{ color: 'rgb(138, 143, 152)' }}
                      />
                      <span
                        style={{
                          fontSize: '14px',
                          color: 'rgb(138, 143, 152)',
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Trust indicators */}
            <div className='mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-tertiary-token'>
              <div className='flex items-center gap-2'>
                <Shield className='w-4 h-4 text-success' />
                <span>30-day money-back guarantee</span>
              </div>
              <div className='hidden sm:block w-px h-4 bg-border-subtle' />
              <div className='flex items-center gap-2'>
                <Check className='w-4 h-4 text-success' />
                <span>Cancel anytime</span>
              </div>
              <div className='hidden sm:block w-px h-4 bg-border-subtle' />
              <div className='flex items-center gap-2'>
                <Zap className='w-4 h-4 text-success' />
                <span>Instant activation</span>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className='max-w-3xl mx-auto mt-24'>
            <h2 className='text-2xl sm:text-3xl font-semibold text-primary-token text-center mb-12'>
              Frequently asked questions
            </h2>
            <div className='grid gap-6'>
              {FAQ_ITEMS.map(item => (
                <div
                  key={item.question}
                  className='rounded-xl border border-subtle bg-surface-1 p-6'
                >
                  <h3 className='text-base font-semibold text-primary-token mb-2'>
                    {item.question}
                  </h3>
                  <p className='text-sm text-secondary-token'>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className='max-w-2xl mx-auto mt-24 text-center'>
            <h2 className='text-2xl sm:text-3xl font-semibold text-primary-token mb-4'>
              Ready to own your audience?
            </h2>
            <p className='text-secondary-token mb-8'>
              Join thousands of artists building direct relationships with their
              fans. No credit card required to start.
            </p>
            <Link
              href='/waitlist'
              className='inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-btn-primary text-btn-primary-foreground text-base font-medium hover:opacity-90 transition-opacity'
            >
              Get early access →
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
