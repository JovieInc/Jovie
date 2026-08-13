import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';

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
          <div className='system-b-pricing-plans'>{plans}</div>
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
