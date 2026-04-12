import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import { LandingCTAButton } from './LandingCTAButton';

interface SharedMarketingHeroProps {
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
  readonly mediaClassName?: string;
  readonly gridClassName?: string;
}

export function SharedMarketingHero({
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
  mediaClassName,
  gridClassName,
}: Readonly<SharedMarketingHeroProps>) {
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

      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div
            className={cn(
              'grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-10',
              gridClassName
            )}
          >
            <div className={cn('max-w-[34rem]', copyClassName)}>
              <p className='homepage-section-eyebrow'>{eyebrow}</p>
              <h1
                id={headingId}
                data-testid={titleTestId}
                className='marketing-h1-linear mt-5 text-primary-token'
              >
                {title}
              </h1>
              <div className='mt-5 max-w-[34rem] text-[17px] leading-[1.7] text-secondary-token sm:text-[18px]'>
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
                  <span className='text-[12px] text-tertiary-token'>
                    {subcopy}
                  </span>
                ) : null}
              </div>

              {proofPoints.length > 0 ? (
                <div className='mt-7 flex flex-wrap gap-2.5'>
                  {proofPoints.map(label => (
                    <span
                      key={label}
                      className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3.5 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-secondary-token'
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
      </Container>
    </section>
  );
}
