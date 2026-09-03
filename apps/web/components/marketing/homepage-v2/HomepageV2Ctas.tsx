// @coverage-via apps/web/tests/unit/home/mounted-home-pricing-system-b-style-guard.test.ts
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { MarketingTerminalCta } from '@/components/site/MarketingTerminalCta';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';

export function HomepageStoryHeader({
  headline,
  body,
  align = 'center',
  className,
  headlineClassName,
  bodyClassName,
  headlineTestId,
}: Readonly<{
  headline: string;
  body?: string;
  align?: 'center' | 'left';
  className?: string;
  headlineClassName?: string;
  bodyClassName?: string;
  headlineTestId?: string;
}>) {
  const centered = align === 'center';

  return (
    <div
      className={cn(centered ? 'mx-auto text-center' : 'max-w-xl', className)}
    >
      <h2
        className={cn('homepage-story-heading', headlineClassName)}
        data-testid={headlineTestId}
      >
        {headline}
      </h2>
      {body ? (
        <p
          className={cn(
            'homepage-story-body',
            centered && 'mx-auto',
            bodyClassName
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function HomepageV2Pricing() {
  return (
    <section
      data-testid='homepage-v2-pricing'
      className='homepage-story-section system-b-mounted-home-pricing'
    >
      <MarketingContainer
        width='page'
        className='system-b-mounted-home-pricing-container'
      >
        <div className='homepage-pricing-shell system-b-mounted-home-pricing-shell'>
          <HomepageStoryHeader
            align='center'
            body='Artist profiles are free forever. Pro adds the release tools when you need them.'
            headline={HOMEPAGE_V2_COPY.pricing.headline}
            className='homepage-pricing-copy system-b-mounted-home-pricing-copy'
          />

          <MarketingPricingPlans
            mode='compact'
            variant='tier-cards-recommended'
            className='system-b-mounted-home-pricing-plans'
          />
        </div>
      </MarketingContainer>
    </section>
  );
}

interface HomepageV2FinalCtaProps {
  readonly headline?: string;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
  readonly sectionTestId?: string;
  readonly headingTestId?: string;
  readonly actionTestId?: string;
  readonly analyticsEventName?: string;
  readonly analyticsSource?: string;
}

export function HomepageV2FinalCta({
  headline = HOMEPAGE_V2_COPY.finalCta.headline,
  ctaLabel = HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel,
  ctaHref = HOMEPAGE_FRONT_DOOR_CTA.primary.href,
  sectionTestId = 'homepage-v2-final-cta',
  headingTestId = 'homepage-v2-final-cta-heading',
  actionTestId = 'homepage-v2-final-cta-primary',
  analyticsEventName,
  analyticsSource,
}: Readonly<HomepageV2FinalCtaProps> = {}) {
  return (
    <MarketingTerminalCta
      variant='homepage-v2'
      penContractId={MARKETING_PEN_CONTRACT_IDS.shell.footerCta}
      testId={sectionTestId}
      headingTestId={headingTestId}
      actionTestId={actionTestId}
      title={headline}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
      ctaSignUp
      ctaAnalyticsEvent={analyticsEventName}
      ctaAnalyticsSource={analyticsSource}
      decoration={
        <div
          aria-hidden='true'
          className='system-b-mounted-home-footer-cta-abyss'
        >
          <div className='system-b-mounted-home-footer-cta-abyss-plane' />
        </div>
      }
    />
  );
}
