// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import { Button } from '@jovie/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarketingContainer } from '@/components/marketing';
import type { MarketingPenContractId } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';

export interface MarketingTerminalCtaProps {
  readonly title: string;
  readonly body?: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
  readonly secondaryLabel?: string;
  readonly secondaryHref?: string;
  readonly ctaAnalyticsEvent?: string;
  readonly ctaAnalyticsSource?: string;
  readonly prefetch?: boolean;
  readonly className?: string;
  readonly decoration?: ReactNode;
  readonly testId: string;
  readonly headingTestId?: string;
  readonly actionTestId?: string;
  readonly ctaSignUp?: boolean;
  readonly variant?: 'cinematic' | 'homepage-v2' | 'standard';
  readonly penContractId: MarketingPenContractId;
}

interface MarketingTerminalCtaActionConfig {
  readonly href: string;
  readonly label: string;
  readonly variant: 'primary' | 'tertiary';
  readonly size: 'lg' | 'md';
  readonly prefetch?: boolean;
  readonly className?: string;
  readonly analyticsEvent?: string;
  readonly analyticsSource?: string;
  readonly trailing?: ReactNode;
  readonly testId?: string;
  readonly signUp?: boolean;
}

/**
 * Single canonical action identity for terminal marketing CTAs. Both primary
 * and optional secondary render through `@jovie/ui` Button asChild so Pen can
 * map instances to the source-backed Button master instead of raw Link frames.
 */
function MarketingTerminalCtaAction({
  href,
  label,
  variant,
  size,
  prefetch,
  className,
  analyticsEvent,
  analyticsSource,
  trailing,
  testId,
  signUp,
}: Readonly<MarketingTerminalCtaActionConfig>) {
  return (
    <Button variant={variant} size={size} asChild className={className}>
      <Link
        href={href}
        prefetch={prefetch}
        data-analytics-event={analyticsEvent}
        data-analytics-source={analyticsSource}
        data-testid={testId}
        data-cta-sign-up={signUp ? 'true' : undefined}
      >
        {label}
        {trailing}
      </Link>
    </Button>
  );
}

const styles = {
  cinematic: {
    section:
      'homepage-story-final-cta relative isolate overflow-hidden bg-black dark:bg-black',
    content: 'homepage-final-cta-copy mx-auto',
    title:
      'text-balance text-[clamp(2rem,3.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.025em] text-(--color-text-tooltip)',
    body: 'mx-auto max-w-[36rem] text-balance text-lg leading-[1.45] text-white/[0.58]',
    actions: 'mt-2 flex flex-wrap items-center justify-center gap-3',
    primary: 'homepage-final-cta-action',
  },
  'homepage-v2': {
    section:
      'homepage-story-final-cta system-b-mounted-home-footer-cta relative isolate overflow-hidden',
    content:
      'homepage-final-cta-copy system-b-mounted-home-footer-cta-copy mx-auto',
    title:
      'homepage-final-cta-heading system-b-mounted-home-footer-cta-heading text-balance',
    body: 'homepage-story-body mx-auto',
    actions: 'contents',
    primary:
      'homepage-final-cta-action system-b-mounted-home-footer-cta-action',
  },
  standard: {
    section:
      'relative isolate overflow-hidden bg-black px-[clamp(1.25rem,2.2vw,2rem)] py-[clamp(5rem,9vw,8rem)] text-(--color-text-tooltip) dark:bg-black',
    content:
      'relative z-[2] mx-auto flex w-full max-w-[var(--homepage-section-max,80rem)] flex-col items-center text-center',
    title:
      'font-display max-w-[20ch] text-balance text-[clamp(2rem,3.4vw,3rem)] font-bold leading-[1.05] tracking-[-0.025em] text-(--color-text-tooltip)',
    body: 'mt-3 max-w-[44rem] text-balance text-lg leading-[1.45] text-white/[0.5]',
    actions: 'mt-7 flex flex-wrap items-center justify-center gap-3',
    primary: undefined,
  },
} as const;

/** Shared terminal marketing CTA composition. Caller wrappers own copy and decoration only. */
export function MarketingTerminalCta({
  title,
  body,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  ctaAnalyticsEvent,
  ctaAnalyticsSource,
  prefetch,
  className,
  decoration,
  testId,
  headingTestId,
  actionTestId,
  ctaSignUp,
  variant = 'standard',
  penContractId,
}: Readonly<MarketingTerminalCtaProps>) {
  const variantStyles = styles[variant];

  const content = (
    <div className={variantStyles.content}>
      <h2
        className={`${variantStyles.title} line-clamp-2`}
        data-testid={headingTestId}
        data-homepage-section-heading={
          variant === 'homepage-v2' ? true : undefined
        }
      >
        {title}
      </h2>
      {body ? <p className={variantStyles.body}>{body}</p> : null}
      <div className={variantStyles.actions}>
        {variant === 'homepage-v2' ? (
          <MarketingTerminalCtaAction
            href={ctaHref}
            label={ctaLabel}
            variant='primary'
            size='md'
            prefetch={prefetch}
            className={variantStyles.primary}
            analyticsEvent={ctaAnalyticsEvent}
            analyticsSource={ctaAnalyticsSource}
            testId={actionTestId}
            signUp={ctaSignUp}
          />
        ) : (
          <MarketingTerminalCtaAction
            href={ctaHref}
            label={ctaLabel}
            variant='primary'
            size='lg'
            prefetch={prefetch}
            className={variantStyles.primary}
            analyticsEvent={ctaAnalyticsEvent}
            analyticsSource={ctaAnalyticsSource}
            testId={actionTestId}
            signUp={ctaSignUp}
          />
        )}
        {secondaryLabel && secondaryHref ? (
          <MarketingTerminalCtaAction
            href={secondaryHref}
            label={secondaryLabel}
            variant='tertiary'
            size='md'
            prefetch={prefetch}
            className='gap-1'
            trailing={<span aria-hidden='true'>→</span>}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      data-pen-contract={penContractId}
      data-testid={testId}
      className={cn(variantStyles.section, className)}
    >
      {decoration}
      {variant === 'cinematic' || variant === 'homepage-v2' ? (
        <MarketingContainer
          width='page'
          className={
            variant === 'homepage-v2'
              ? 'system-b-mounted-home-footer-cta-container'
              : 'relative z-10'
          }
        >
          {content}
        </MarketingContainer>
      ) : (
        content
      )}
    </section>
  );
}
