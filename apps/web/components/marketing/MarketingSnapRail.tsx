'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useId, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import './MarketingSnapRail.css';

export interface MarketingSnapRailProps {
  readonly children: ReactNode;
  readonly ariaLabel: string;
  readonly instructionsId?: string;
  readonly instructions?: string;
  readonly className?: string;
  readonly railClassName?: string;
  readonly testId?: string;
  /** Test id on the scrollable horizon element. */
  readonly scrollerTestId?: string;
  /** When true, desktop prev/next float over the rail. Mobile always uses native swipe. */
  readonly overlayControlsOnDesktop?: boolean;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

/**
 * Shared horizontal snap rail for marketing card horizons.
 *
 * Native overflow + scroll-snap for physical mobile swipe; optional prev/next
 * controls for desktop. Desktop rails push content (padding-based peeks);
 * they do not overlay page chrome. Do not introduce page-local scrollers —
 * compose this primitive instead.
 */
export function MarketingSnapRail({
  children,
  ariaLabel,
  instructionsId,
  instructions,
  className,
  railClassName,
  testId = 'marketing-snap-rail',
  scrollerTestId,
  overlayControlsOnDesktop = false,
  previousLabel = 'Scroll Left',
  nextLabel = 'Scroll Right',
}: Readonly<MarketingSnapRailProps>) {
  const generatedId = useId();
  const railId = `marketing-snap-rail-${generatedId}`;
  const describedBy = instructionsId ?? `${railId}-instructions`;
  const scrollerRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  const scrollByDirection = useCallback(
    (direction: 'prev' | 'next') => {
      const rail = scrollerRef.current;
      if (!rail) {
        return;
      }

      const scrollStep = Math.max(rail.clientWidth * 0.8, 240);
      rail.scrollBy({
        left: direction === 'next' ? scrollStep : -scrollStep,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [reducedMotion]
  );

  const navButtons = (
    <>
      <button
        type='button'
        aria-controls={railId}
        aria-label={previousLabel}
        onClick={() => {
          scrollByDirection('prev');
        }}
        className='marketing-snap-rail__nav-btn pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-xl transition-colors'
      >
        <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      </button>
      <button
        type='button'
        aria-controls={railId}
        aria-label={nextLabel}
        onClick={() => {
          scrollByDirection('next');
        }}
        className='marketing-snap-rail__nav-btn pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-xl transition-colors'
      >
        <ChevronRight className='h-4 w-4' aria-hidden='true' />
      </button>
    </>
  );

  return (
    <div className={cn('marketing-snap-rail', className)} data-testid={testId}>
      {instructions ? (
        <p id={describedBy} className='sr-only'>
          {instructions}
        </p>
      ) : null}

      <div className='marketing-snap-rail__frame relative w-full overflow-x-hidden'>
        {/* Desktop: default controls sit in-flow and push the rail down (no card overlay). */}
        {!overlayControlsOnDesktop ? (
          <div className='marketing-snap-rail__controls pointer-events-none mb-4 hidden items-center justify-end gap-2 pr-5 sm:pr-6 lg:flex lg:pr-[max(1.5rem,calc((100vw-var(--public-content-max-page))/2))]'>
            {navButtons}
          </div>
        ) : (
          <div className='marketing-snap-rail__controls marketing-snap-rail__controls--overlay pointer-events-none absolute right-[max(1.25rem,calc((100vw-var(--public-content-max-page))/2))] top-4 z-20 hidden items-center gap-2 lg:flex'>
            {navButtons}
          </div>
        )}

        <div className='hidden sm:block lg:hidden'>
          <div className='sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-6 focus-within:top-4 focus-within:z-20 focus-within:flex focus-within:gap-2'>
            <button
              type='button'
              aria-controls={railId}
              aria-label={previousLabel}
              onClick={() => {
                scrollByDirection('prev');
              }}
              className='marketing-snap-rail__rail-btn min-h-11 min-w-11 rounded-full bg-(--color-cell-hover) px-3 py-2 text-xs font-semibold'
            >
              Prev
            </button>
            <button
              type='button'
              aria-controls={railId}
              aria-label={nextLabel}
              onClick={() => {
                scrollByDirection('next');
              }}
              className='marketing-snap-rail__rail-btn min-h-11 min-w-11 rounded-full bg-(--color-cell-hover) px-3 py-2 text-xs font-semibold'
            >
              Next
            </button>
          </div>
        </div>

        <section
          ref={scrollerRef}
          id={railId}
          aria-label={ariaLabel}
          aria-describedby={instructions ? describedBy : undefined}
          data-testid={scrollerTestId ?? `${testId}-scroller`}
          className={cn(
            'marketing-snap-rail__scroller relative grid grid-cols-1 gap-3 overflow-visible pb-3 pl-5 pr-5 sm:flex sm:gap-3.5 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:snap-x sm:snap-mandatory sm:pl-6 sm:pr-[12vw] sm:scroll-pl-6 lg:pl-[max(1.5rem,calc((100vw-var(--public-content-max-page))/2))] lg:pr-[14vw] lg:scroll-pl-[max(1.5rem,calc((100vw-var(--public-content-max-page))/2))] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            !reducedMotion && 'sm:scroll-smooth',
            railClassName
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
