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

/** Comparison lead: names the table's job without repeating card copy. */
const PRICING_COMPARE_BODY = 'What each plan includes.';

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
          subtitle={`Jovie profiles are free forever. ${proClaim.displayName} is ${proMonthlyPrice}, self-serve.`}
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
          className='system-b-pricing-section system-b-pricing-section--plans'
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
                  {PRICING_COMPARE_BODY}
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
              {/* One action: hero and plan cards already offer Free and Enterprise. */}
              <div className='system-b-pricing-actions system-b-pricing-actions--center'>
                <Link
                  href={proClaim.ctaHref}
                  prefetch={false}
                  className='system-b-pricing-primary-link'
                >
                  {proClaim.ctaLabel}
                </Link>
              </div>
            </div>
          </MarketingContainer>
        </section>
      </div>
    </MarketingPageShell>
  );
}
