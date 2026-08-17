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
  readonly variant?: 'cinematic' | 'standard';
  readonly penContractId: MarketingPenContractId;
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
  variant = 'standard',
  penContractId,
}: Readonly<MarketingTerminalCtaProps>) {
  const variantStyles = styles[variant];

  const content = (
    <div className={variantStyles.content}>
      <h2 className={variantStyles.title}>{title}</h2>
      {body ? <p className={variantStyles.body}>{body}</p> : null}
      <div className={variantStyles.actions}>
        <Button
          variant='primary'
          size='lg'
          asChild
          className={variantStyles.primary}
        >
          <Link
            href={ctaHref}
            prefetch={prefetch}
            data-analytics-event={ctaAnalyticsEvent}
            data-analytics-source={ctaAnalyticsSource}
          >
            {ctaLabel}
          </Link>
        </Button>
        {secondaryLabel && secondaryHref ? (
          <Button variant='tertiary' size='md' asChild className='gap-1'>
            <Link href={secondaryHref} prefetch={prefetch}>
              {secondaryLabel}
              <span aria-hidden='true'>→</span>
            </Link>
          </Button>
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
      {variant === 'cinematic' ? (
        <MarketingContainer width='page' className='relative z-10'>
          {content}
        </MarketingContainer>
      ) : (
        content
      )}
    </section>
  );
}
