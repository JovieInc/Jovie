import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';

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
  readonly media: ReactNode;
  readonly seam: ReactNode;
  readonly trackedLinkComponent?: ElementType;
  readonly headingId?: string;
}

export function HomepagePosterHero({
  headline,
  subtitle,
  primaryCta,
  media,
  seam,
  trackedLinkComponent = Link,
  headingId = 'homepage-poster-hero-heading',
}: HomepagePosterHeroProps) {
  const LinkComponent = trackedLinkComponent;
  const analyticsProps =
    trackedLinkComponent !== Link && primaryCta.eventName
      ? {
          eventName: primaryCta.eventName,
          eventProperties: primaryCta.eventProperties,
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
          <Button asChild size='md' variant='primary'>
            <LinkComponent
              href={primaryCta.href}
              prefetch={primaryCta.prefetch}
              {...analyticsProps}
              data-testid='homepage-primary-cta'
              data-cta-sign-up={primaryCta.signUp ? 'true' : undefined}
            >
              {primaryCta.label}
            </LinkComponent>
          </Button>
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
