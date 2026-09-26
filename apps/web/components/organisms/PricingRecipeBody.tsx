import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  getPublicPriceClaim,
  type PublicPriceClaim,
} from '@/lib/billing/offer-truth';

const STORY_CARDS = [
  {
    label: 'Profile',
    headline: 'Public artist profile and audience capture',
    body: 'Claim profile same day.',
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

function formatMonthlyPrice(claim: PublicPriceClaim): string {
  return `${claim.priceLabel}/month`;
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
  const freeClaim = getPublicPriceClaim('free');
  const proClaim = getPublicPriceClaim('pro');
  const enterpriseClaim = getPublicPriceClaim('enterprise');
  const proMonthlyPrice = formatMonthlyPrice(proClaim);

  return (
    <MarketingPageShell className='system-b-pricing-page'>
      <div data-offer-contract={ARTIST_VISIBILITY_OFFER_CONTRACT_ID}>
        {structuredData}

        <MarketingHero
          className='system-b-pricing-hero'
          headingId='pricing-hero-heading'
          headline='Pricing'
          subtitle={`Artist profiles are free forever. Artist Visibility Pro is ${proMonthlyPrice} with limited access.`}
          primaryCta={{
            label: freeClaim.ctaLabel,
            href: freeClaim.ctaHref,
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
                  Public artist profile and audience capture.
                </p>
              </div>
              <div className='system-b-pricing-chart-wrap'>
                {comparisonChart}
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
                  href={freeClaim.ctaHref}
                  prefetch={false}
                  className='system-b-pricing-secondary-link'
                >
                  {freeClaim.ctaLabel}
                </Link>
                <Link
                  href={proClaim.ctaHref}
                  prefetch={false}
                  className='system-b-pricing-secondary-link'
                >
                  {proClaim.ctaLabel}
                </Link>
                <a
                  href={enterpriseClaim.ctaHref}
                  className='system-b-pricing-secondary-link'
                >
                  {enterpriseClaim.ctaLabel}
                </a>
              </div>
            </div>
          </MarketingContainer>
        </section>
      </div>
    </MarketingPageShell>
  );
}
