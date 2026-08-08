import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { MarketingCtaPendingLabel } from './MarketingCtaPendingLabel';

export interface MarketingPosterHeroCta {
  readonly label: ReactNode;
  readonly href: string;
  readonly eventName?: string;
  readonly eventProperties?: Record<string, unknown>;
  readonly prefetch?: boolean;
  readonly signUp?: boolean;
}

export interface MarketingPosterHeroProps {
  readonly headline: string;
  readonly subtitle: string;
  readonly lede?: string;
  readonly primaryCta: MarketingPosterHeroCta;
  readonly secondaryCta?: MarketingPosterHeroCta;
  readonly media: ReactNode;
  readonly seam: ReactNode;
  readonly trackedLinkComponent?: ElementType;
  readonly headingId?: string;
}

/**
 * Shared poster composition used by marketing surfaces with a reserved seam
 * between copy and product media. Callers retain ownership of copy, media,
 * analytics, and route-specific styling.
 */
export function MarketingPosterHero({
  headline,
  subtitle,
  lede,
  primaryCta,
  secondaryCta,
  media,
  seam,
  trackedLinkComponent = Link,
  headingId = 'homepage-poster-hero-heading',
}: MarketingPosterHeroProps) {
  const LinkComponent = trackedLinkComponent;
  const analyticsPropsFor = (cta: MarketingPosterHeroCta) =>
    trackedLinkComponent !== Link && cta.eventName
      ? {
          eventName: cta.eventName,
          eventProperties: cta.eventProperties,
        }
      : {};

  return (
    <section
      className='homepage-poster-hero'
      aria-labelledby={headingId}
      data-testid='homepage-hero-shell'
    >
      <div className='homepage-poster-hero__copy'>
        <h1 id={headingId} className='homepage-poster-hero__headline'>
          {headline}
        </h1>
        <p className='homepage-poster-hero__subtitle'>{subtitle}</p>
        {lede ? <p className='homepage-poster-hero__lede'>{lede}</p> : null}
        <div className='homepage-poster-hero__actions'>
          <Button asChild static size='md' variant='primary'>
            <LinkComponent
              href={primaryCta.href}
              prefetch={primaryCta.prefetch}
              {...analyticsPropsFor(primaryCta)}
              data-testid='homepage-primary-cta'
              data-cta-sign-up={primaryCta.signUp ? 'true' : undefined}
            >
              <MarketingCtaPendingLabel>
                {primaryCta.label}
              </MarketingCtaPendingLabel>
            </LinkComponent>
          </Button>
          {secondaryCta ? (
            <Button asChild static size='md' variant='ghost'>
              <LinkComponent
                href={secondaryCta.href}
                prefetch={secondaryCta.prefetch}
                {...analyticsPropsFor(secondaryCta)}
                data-testid='homepage-secondary-cta'
              >
                {secondaryCta.label}
              </LinkComponent>
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className='homepage-poster-hero__seam'
        data-testid='homepage-poster-hero-seam'
      >
        {seam}
      </div>
      <div
        className='homepage-poster-hero__media'
        data-testid='homepage-poster-hero-media'
      >
        {media}
      </div>
    </section>
  );
}
