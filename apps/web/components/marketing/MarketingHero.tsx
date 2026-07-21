import { Button } from '@jovie/ui/atoms/button';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { LandingCTAButton } from '@/components/features/landing/LandingCTAButton';
import { APP_ROUTES } from '@/constants/routes';
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

interface MarketingHeroBaseProps {
  readonly className?: string;
  /** Id applied to the hero heading and referenced by `aria-labelledby`. */
  readonly headingId?: string;
}

/**
 * Shell mode — hero section layout primitive for content-heavy page
 * sections (blog, changelog, support, compare) that are not marketing
 * heroes. Renders a full-width section with Linear hero spacing and
 * caller-provided children.
 */
export interface MarketingHeroShellProps extends MarketingHeroBaseProps {
  /**
   * - `centered`: single column, text centered, constrained to page width
   * - `left`: single column, text left-aligned, constrained to page width
   * - `split`: two-column grid on md+, text left / media right
   */
  readonly variant: 'split' | 'centered' | 'left';
  readonly children: ReactNode;
}

/**
 * Content mode — the canonical content-driven landing hero: one-line 56px
 * headline, 18px subtitle, dual CTA (primary + ghost) on the canonical
 * button system, and the distributor logo bar as the proof element.
 */
export interface MarketingHeroContentProps extends MarketingHeroBaseProps {
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
  readonly testId?: string;
  /**
   * Link renderer override (e.g. an analytics-tracked link component).
   * Defaults to `next/link`.
   */
  readonly linkComponent?: ElementType;
}

/**
 * Landing mode — feature-landing hero (`/voice`) with eyebrow, rich
 * ReactNode title/body, tracked primary CTA, text secondary CTA, subcopy,
 * proof chips, and a media column over the Linear hero backdrop.
 */
export interface MarketingHeroLandingProps extends MarketingHeroBaseProps {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly body: ReactNode;
  readonly media: ReactNode;
  readonly headingId: string;
  readonly titleTestId?: string;
  readonly sectionTestId?: string;
  readonly primaryCtaLabel?: string;
  readonly primaryCtaHref?: string;
  readonly ctaEventName?: string;
  readonly primaryCtaTestId?: string;
  readonly secondaryCtaLabel?: string;
  readonly secondaryCtaHref?: string;
  readonly subcopy?: string;
  readonly proofPoints?: readonly string[];
  readonly copyClassName?: string;
  readonly titleClassName?: string;
  readonly mediaClassName?: string;
  readonly gridClassName?: string;
}

export type MarketingHeroProps =
  | MarketingHeroShellProps
  | MarketingHeroContentProps
  | MarketingHeroLandingProps;

const shellVariantClasses = {
  centered:
    'mx-auto flex max-w-300 flex-col items-center px-6 text-center sm:px-8 lg:px-10',
  left: 'mx-auto flex max-w-300 flex-col items-start px-6 text-left sm:px-8 lg:px-10',
  split:
    'mx-auto grid max-w-320 grid-cols-1 items-center gap-10 px-6 sm:px-8 md:grid-cols-2 md:gap-16 lg:px-10',
} as const;

function MarketingHeroShell({
  variant,
  className,
  children,
}: MarketingHeroShellProps) {
  return (
    <section
      className={cn(
        'relative w-full',
        'pt-20 pb-16 sm:pt-24 sm:pb-24 lg:pt-28 lg:pb-32',
        shellVariantClasses[variant],
        className
      )}
    >
      {children}
    </section>
  );
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

function MarketingHeroContent({
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
}: MarketingHeroContentProps) {
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

function MarketingHeroLanding({
  eyebrow,
  title,
  body,
  media,
  headingId,
  titleTestId = 'hero-heading',
  sectionTestId = 'marketing-hero-section',
  primaryCtaLabel = 'Get started',
  primaryCtaHref = APP_ROUTES.SIGNUP,
  ctaEventName = 'landing_cta_get_started',
  primaryCtaTestId,
  secondaryCtaLabel,
  secondaryCtaHref,
  subcopy,
  proofPoints = [],
  copyClassName,
  titleClassName,
  mediaClassName,
  gridClassName,
}: MarketingHeroLandingProps) {
  return (
    <section
      className='relative overflow-hidden pb-12 pt-[5.75rem] md:pb-16 md:pt-[6.25rem] lg:pb-20'
      data-testid={sectionTestId}
      aria-labelledby={headingId}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[36rem]' />

      {/* Padding override preserves the legacy landing-hero spacing
          (px-5 sm:px-6 lg:px-8) while the max-width comes from the
          canonical MarketingContainer token. */}
      <MarketingContainer width='page' className='px-5 sm:px-6 lg:px-8'>
        <div className='mx-auto max-w-300'>
          <div
            className={cn(
              'grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-10',
              gridClassName
            )}
          >
            <div className={cn('max-w-[34rem]', copyClassName)}>
              {eyebrow ? (
                <p className='homepage-section-eyebrow'>{eyebrow}</p>
              ) : null}
              <h1
                id={headingId}
                data-testid={titleTestId}
                className={cn(
                  'marketing-h1-linear mt-5 text-primary-token',
                  titleClassName
                )}
              >
                {title}
              </h1>
              <div className='mt-5 max-w-[34rem] text-base leading-[1.7] text-secondary-token sm:text-lg'>
                {body}
              </div>

              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <LandingCTAButton
                  href={primaryCtaHref}
                  label={primaryCtaLabel}
                  eventName={ctaEventName}
                  section='hero'
                  testId={primaryCtaTestId}
                />

                {secondaryCtaLabel && secondaryCtaHref ? (
                  <Link
                    href={secondaryCtaHref}
                    className='inline-flex h-10 items-center rounded-full border border-subtle px-4 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
                  >
                    {secondaryCtaLabel}
                  </Link>
                ) : null}

                {subcopy ? (
                  <span className='text-xs text-tertiary-token'>{subcopy}</span>
                ) : null}
              </div>

              {proofPoints.length > 0 ? (
                <div className='mt-7 flex flex-wrap gap-2.5'>
                  {proofPoints.map(label => (
                    <span
                      key={label}
                      className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3.5 py-1.5 text-xs font-medium tracking-tight text-secondary-token'
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                'lg:justify-self-center xl:justify-self-end',
                mediaClassName
              )}
            >
              {media}
            </div>
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

/**
 * The single marketing hero section primitive.
 *
 * Three modes, discriminated by required props:
 * - Shell (`variant` + `children`): layout shell for content-heavy page
 *   heroes — support, about, blog, changelog, compare, alternatives, pay.
 * - Content (`headline` + `subtitle` + `primaryCta`): the canonical
 *   content-driven landing hero with dual CTA and logo-bar proof.
 * - Landing (`eyebrow` + `title` + `body` + `media`): feature-landing
 *   hero (`/voice`) over the Linear hero backdrop.
 */
export function MarketingHero(props: MarketingHeroProps) {
  if ('variant' in props) {
    return <MarketingHeroShell {...props} />;
  }
  if ('title' in props) {
    return <MarketingHeroLanding {...props} />;
  }
  return <MarketingHeroContent {...props} />;
}
