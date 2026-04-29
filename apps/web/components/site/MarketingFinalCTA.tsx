import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

export interface MarketingFinalCTAProps {
  /** Override headline copy. Defaults to the standard private launch request line. */
  readonly title?: string;
  /** Optional supporting paragraph below the headline. */
  readonly body?: string;
  /** Primary CTA label. Defaults to "Request Access". */
  readonly ctaLabel?: string;
  /** Primary CTA destination. Defaults to the signup route. */
  readonly ctaHref?: string;
  /** Optional secondary CTA shown to the right of the primary. */
  readonly secondaryLabel?: string;
  readonly secondaryHref?: string;
  readonly className?: string;
  readonly testId?: string;
}

const DEFAULT_TITLE = 'Request private launch access.';
const DEFAULT_CTA_LABEL = 'Request Access';
const DEFAULT_CTA_HREF = APP_ROUTES.SIGNUP;

export function MarketingFinalCTA({
  title = DEFAULT_TITLE,
  body,
  ctaLabel = DEFAULT_CTA_LABEL,
  ctaHref = DEFAULT_CTA_HREF,
  secondaryLabel,
  secondaryHref,
  className,
  testId = 'marketing-final-cta',
}: Readonly<MarketingFinalCTAProps>) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'relative isolate overflow-hidden bg-black px-[clamp(1.25rem,2.2vw,2rem)] py-[clamp(5rem,9vw,8rem)] text-white',
        className
      )}
    >
      <div className='relative z-[2] mx-auto flex w-full max-w-[var(--homepage-section-max,80rem)] flex-col items-center text-center'>
        <h2 className='font-display max-w-[20ch] text-balance text-[clamp(2rem,3.4vw,3rem)] font-[680] leading-[1.05] tracking-[-0.025em] text-white'>
          {title}
        </h2>
        {body ? (
          <p className='mt-3 max-w-[44rem] text-balance text-[18px] leading-[1.45] text-white/[0.5]'>
            {body}
          </p>
        ) : null}
        <div className='mt-7 flex flex-wrap items-center justify-center gap-3'>
          <Link
            href={ctaHref}
            prefetch={false}
            className='inline-flex h-10 items-center rounded-full bg-[rgb(252,252,252)] px-6 text-[14px] font-semibold tracking-[0.01em] text-black transition-opacity duration-150 hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
          >
            {ctaLabel}
          </Link>
          {secondaryLabel && secondaryHref ? (
            <Link
              href={secondaryHref}
              prefetch={false}
              className='inline-flex h-10 items-center gap-1 rounded-full px-6 text-[14px] font-semibold tracking-[0.01em] text-white/92 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
            >
              {secondaryLabel}
              <span aria-hidden='true'>→</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
