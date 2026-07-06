import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { cn } from '@/lib/utils';
import { MarketingContainer } from './MarketingContainer';

export interface MarketingHeroCta {
  readonly label: ReactNode;
  readonly href: string;
  readonly testId?: string;
  /** Marks the link as a sign-up entry point (renders `data-cta-sign-up`). */
  readonly signUp?: boolean;
  /**
   * Analytics event name forwarded to a tracked `linkComponent`
   * (e.g. `HomepageTrackedLink`). Ignored by the default `next/link`.
   */
  readonly eventName?: string;
  readonly eventProperties?: Record<string, unknown>;
  readonly prefetch?: boolean;
}

export interface MarketingHeroProps {
  /** One-line value prop. 56px Inter at `--font-weight-bold` (680). */
  readonly headline: string;
  /** 1-2 line supporting copy. 18px Inter at 400. */
  readonly subtitle: string;
  readonly primaryCta: MarketingHeroCta;
  readonly secondaryCta?: MarketingHeroCta;
  /**
   * Proof element rendered below the hero copy. Defaults to the existing
   * distributor logo bar (`HomeTrustSection`). Pass `false` to omit, or a
   * node to override.
   *
   * Intentionally NO stats props: numeric social-proof claims must not
   * render here (decision, 2026-07-03 — unverifiable stats never ship;
   * the logo bar is the only defensible proof).
   */
  readonly logos?: ReactNode | false;
  /** Optional media column (product proof) rendered beside the copy on md+. */
  readonly media?: ReactNode;
  /** Copy alignment when no `media` column is present. */
  readonly align?: 'center' | 'left';
  readonly headingId?: string;
  readonly testId?: string;
  readonly className?: string;
  /**
   * Link renderer override (e.g. an analytics-tracked link component).
   * Defaults to `next/link`.
   */
  readonly linkComponent?: ElementType;
}

function MarketingHeroCtaLink({
  cta,
  intent,
  linkComponent,
}: {
  readonly cta: MarketingHeroCta;
  readonly intent: 'primary' | 'secondary';
  readonly linkComponent: ElementType;
}) {
  const LinkComponent = linkComponent;
  const analyticsProps = cta.eventName
    ? { eventName: cta.eventName, eventProperties: cta.eventProperties }
    : {};

  return (
    <Button
      asChild
      size='md'
      variant={intent === 'primary' ? 'primary' : 'ghost'}
      className='marketing-hero-cta'
    >
      <LinkComponent
        href={cta.href}
        prefetch={cta.prefetch}
        data-testid={cta.testId}
        data-primary-action={intent === 'primary' ? 'true' : undefined}
        data-cta-sign-up={cta.signUp ? 'true' : undefined}
        {...analyticsProps}
      >
        {cta.label}
      </LinkComponent>
    </Button>
  );
}

/**
 * Canonical marketing hero — one hero, dual CTA, logo-bar proof.
 *
 * The single hero for landing surfaces (`/`, `/pricing`, feature pages):
 * a one-line 56px Inter headline, an 18px subtitle, a dual CTA on the
 * canonical button system (primary + ghost), and the distributor logo bar
 * as the proof element below the copy. Stacks to a single column below
 * 768px. Replaces the previous placeholder hero variants
 * (centered / left / split demo content).
 */
export function MarketingHero({
  headline,
  subtitle,
  primaryCta,
  secondaryCta,
  logos,
  media,
  align = 'center',
  headingId,
  testId,
  className,
  linkComponent = Link,
}: MarketingHeroProps) {
  const layout = media ? 'split' : align;

  return (
    <section
      className={cn('marketing-hero', `marketing-hero--${layout}`, className)}
      aria-labelledby={headingId}
      data-testid={testId}
    >
      <MarketingContainer width='page'>
        <div className='marketing-hero-inner'>
          <div className='marketing-hero-copy'>
            <h1 id={headingId} className='marketing-hero-headline'>
              {headline}
            </h1>
            <p className='marketing-hero-subtitle'>{subtitle}</p>
            <div className='marketing-hero-actions'>
              <MarketingHeroCtaLink
                cta={primaryCta}
                intent='primary'
                linkComponent={linkComponent}
              />
              {secondaryCta ? (
                <MarketingHeroCtaLink
                  cta={secondaryCta}
                  intent='secondary'
                  linkComponent={linkComponent}
                />
              ) : null}
            </div>
          </div>
          {media ? <div className='marketing-hero-media'>{media}</div> : null}
        </div>
      </MarketingContainer>
      {logos === false ? null : (
        <div className='marketing-hero-logos'>
          {logos ?? (
            <MarketingContainer width='page'>
              <HomeTrustSection variant='compact' presentation='card' />
            </MarketingContainer>
          )}
        </div>
      )}
    </section>
  );
}
