import Link from 'next/link';
import type { ReactNode } from 'react';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';

export const PRICING_FAQ_ITEMS = [
  {
    question: 'Can I start with a free artist profile?',
    answer:
      'Yes. Free includes your public artist profile, smart release links, basic audience signal, and up to 100 contacts.',
  },
  {
    question: 'What does Pro add?',
    answer:
      'Pro adds release notifications, presaves, countdown pages, 180-day analytics, unlimited contacts, exports, tips, a verified badge, and 70 AI messages each week.',
  },
  {
    question: 'What is included with Max?',
    answer:
      'Max adds release-plan generation, metadata preparation, unlimited analytics, email campaigns, API access, and 250 AI messages each week.',
  },
  {
    question: 'Where can I manage my plan?',
    answer:
      'After you sign in, open Settings and choose Billing to view or manage your subscription.',
  },
] as const;

interface PricingRecipeBodyProps {
  readonly requestAccessCopy: string;
  readonly plans: ReactNode;
  readonly comparisonChart: ReactNode;
  readonly structuredData?: ReactNode;
}

export function PricingRecipeBody({
  requestAccessCopy,
  plans,
  comparisonChart,
  structuredData,
}: Readonly<PricingRecipeBodyProps>) {
  return (
    <MarketingPageShell className='system-b-pricing-page'>
      {structuredData}

      <MarketingHero
        className='system-b-pricing-hero'
        headingId='pricing-hero-heading'
        headline='Pricing'
        subtitle='Artist profiles are free forever. Pro adds the release tools when you need them.'
        primaryCta={{
          label: 'Claim Your Profile',
          href: `${APP_ROUTES.SIGNUP}?plan=free`,
        }}
        secondaryCta={{
          label: 'Explore Artist Profiles',
          href: APP_ROUTES.ARTIST_PROFILES,
        }}
        align='center'
        logos={false}
      />

      <section aria-label='Plans' className='system-b-pricing-section'>
        <MarketingContainer width='page'>
          <div className='system-b-pricing-plans'>{plans}</div>
        </MarketingContainer>
      </section>

      <section aria-label='Experience' className='system-b-pricing-trust'>
        <MarketingContainer width='page'>
          <HomeTrustSection variant='compact' presentation='card' />
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
                Compare All Features
              </h2>
              <p className='system-b-pricing-section-body'>
                See the plan matrix for notifications, analytics, contacts,
                smart links, and release workspace capabilities.
              </p>
            </div>
            <div className='system-b-pricing-chart-wrap'>{comparisonChart}</div>
          </div>
        </MarketingContainer>
      </section>

      <section
        aria-labelledby='pricing-proof-heading'
        className='system-b-pricing-proof'
      >
        <MarketingContainer width='page'>
          <figure className='system-b-pricing-proof-inner'>
            <p
              id='pricing-proof-heading'
              className='system-b-pricing-proof-label'
            >
              Why Jovie exists
            </p>
            <blockquote>
              “{ARTIST_PROFILE_SOCIAL_PROOF.founderQuote?.quote}”
            </blockquote>
            <figcaption>
              {ARTIST_PROFILE_SOCIAL_PROOF.founderQuote?.name},{' '}
              {ARTIST_PROFILE_SOCIAL_PROOF.founderQuote?.role}
            </figcaption>
          </figure>
        </MarketingContainer>
      </section>

      <FaqSection
        items={PRICING_FAQ_ITEMS}
        heading='Questions, answered'
        className='system-b-pricing-faq'
        headingClassName='system-b-pricing-section-title'
      />

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
