import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { HomepageCtaPendingLabel } from './HomepageCtaPendingLabel';

export interface HomepagePosterHeroCta {
  readonly label: ReactNode;
  readonly href: string;
  readonly eventName?: string;
  readonly eventProperties?: Record<string, unknown>;
  readonly prefetch?: boolean;
  readonly signUp?: boolean;
}

export interface HomepagePosterHeroProps {
  readonly headline: string;
  readonly subtitle: string;
  readonly primaryCta: HomepagePosterHeroCta;
  readonly secondaryCta?: HomepagePosterHeroCta;
  readonly media: ReactNode;
  readonly seam: ReactNode;
  readonly trackedLinkComponent?: ElementType;
  readonly headingId?: string;
}

export function HomepagePosterHero({
  headline,
  subtitle,
  primaryCta,
  secondaryCta,
  media,
  seam,
  trackedLinkComponent = Link,
  headingId = 'homepage-poster-hero-heading',
}: HomepagePosterHeroProps) {
  const LinkComponent = trackedLinkComponent;
  const analyticsPropsFor = (cta: HomepagePosterHeroCta) =>
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
        <div className='homepage-poster-hero__actions'>
          <Button
            asChild
            size='md'
            variant='primary'
            className='homepage-poster-hero__primary-cta'
          >
            <LinkComponent
              href={primaryCta.href}
              prefetch={primaryCta.prefetch}
              {...analyticsPropsFor(primaryCta)}
              data-testid='homepage-primary-cta'
              data-cta-sign-up={primaryCta.signUp ? 'true' : undefined}
            >
              <HomepageCtaPendingLabel>
                {primaryCta.label}
              </HomepageCtaPendingLabel>
            </LinkComponent>
          </Button>
          {secondaryCta ? (
            <Button
              asChild
              size='md'
              variant='ghost'
              className='homepage-poster-hero__secondary-cta'
            >
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
