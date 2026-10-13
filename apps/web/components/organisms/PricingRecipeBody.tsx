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

function formatMonthlyPrice(claim: PublicPriceClaim): string {
  return `${claim.priceLabel}/month`;
}

interface PricingRecipeBodyProps {
  readonly requestAccessCopy: string;
  readonly plans: ReactNode;
  readonly comparisonChart: ReactNode;
  readonly structuredData?: ReactNode;
  /** Renders nothing when the visibility-audit offer is off. */
  readonly auditOffer?: ReactNode;
}

export function PricingRecipeBody({
  requestAccessCopy,
  plans,
  comparisonChart,
  structuredData,
  auditOffer = null,
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
          testId='marketing-section-hero'
          sectionVariant='centered-none'
          sectionOwner='apps/web/components/organisms/PricingRecipeBody.tsx'
          headline='Pricing'
          logos={false}
          subtitle={`Jovie profiles are free forever. Artist Presence is ${proMonthlyPrice} with limited access.`}
          primaryCta={{
            label: freeClaim.ctaLabel,
            href: freeClaim.ctaHref,
          }}
          secondaryCta={{
            label: 'Explore Jovie Profiles',
            href: APP_ROUTES.ARTIST_PROFILES,
          }}
        />

        <section
          aria-label='Plans'
          className='system-b-pricing-section'
          data-testid='marketing-section-pricing'
          data-marketing-owner='apps/web/components/organisms/PricingRecipeBody.tsx'
          data-marketing-variant='tier-cards-neutral'
        >
          <MarketingContainer width='page'>
            <div className='system-b-pricing-plans'>{plans}</div>
            {auditOffer}
          </MarketingContainer>
        </section>

        <section
          aria-labelledby='pricing-compare-heading'
          data-testid='marketing-section-comparison'
          data-marketing-owner='apps/web/components/organisms/PricingRecipeBody.tsx'
          data-marketing-variant='feature-matrix'
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
                  Public Jovie profile and audience capture.
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
          data-testid='marketing-section-cta'
          data-marketing-owner='apps/web/components/organisms/PricingRecipeBody.tsx'
          data-marketing-variant='plan-actions'
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
