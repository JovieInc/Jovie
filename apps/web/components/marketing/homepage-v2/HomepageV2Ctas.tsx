import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { MarketingContainer } from '@/components/marketing';
import { HOMEPAGE_FRONT_DOOR_CTA } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
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
      className={cn(
        centered ? 'mx-auto text-center' : 'max-w-[38rem]',
        className
      )}
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
      className='homepage-story-section'
    >
      <MarketingContainer width='page'>
        <div className='homepage-pricing-shell'>
          <HomepageStoryHeader
            align='center'
            body='Artist profiles are free forever. Pro adds the release tools when you need them.'
            headline={HOMEPAGE_V2_COPY.pricing.headline}
            className='homepage-pricing-copy'
          />

          <MarketingPricingPlans mode='compact' />
        </div>
      </MarketingContainer>
    </section>
  );
}

export function HomepageV2FinalCta() {
  return (
    <section
      data-testid='homepage-v2-final-cta'
      className='homepage-story-final-cta system-b-mounted-home-footer-cta relative isolate overflow-hidden'
    >
      <MarketingContainer
        width='page'
        className='system-b-mounted-home-footer-cta-container'
      >
        <div className='homepage-final-cta-copy system-b-mounted-home-footer-cta-copy mx-auto'>
          <h2
            data-testid='homepage-v2-final-cta-heading'
            className='homepage-final-cta-heading system-b-mounted-home-footer-cta-heading text-balance'
          >
            {HOMEPAGE_V2_COPY.finalCta.headline}
          </h2>
          <Button
            variant='primary'
            size='md'
            asChild
            className='homepage-final-cta-action system-b-mounted-home-footer-cta-action'
          >
            <Link
              href={HOMEPAGE_FRONT_DOOR_CTA.primary.href}
              data-testid='homepage-v2-final-cta-primary'
              data-cta-sign-up='true'
            >
              {HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel}
            </Link>
          </Button>
        </div>
      </MarketingContainer>
    </section>
  );
}
