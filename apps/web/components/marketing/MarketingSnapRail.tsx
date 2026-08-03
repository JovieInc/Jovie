'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
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
  readonly showMobileControls?: boolean;
  readonly showDesktopControls?: boolean;
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
  showMobileControls = false,
  showDesktopControls = true,
  previousLabel = 'Scroll Left',
  nextLabel = 'Scroll Right',
}: Readonly<MarketingSnapRailProps>) {
  const generatedId = useId();
  const railId = `marketing-snap-rail-${generatedId}`;
  const describedBy = instructionsId ?? `${railId}-instructions`;
  const scrollerRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const [scrollState, setScrollState] = useState({
    ready: false,
    canScrollPrevious: false,
    canScrollNext: false,
  });

  const measureScrollState = useCallback(() => {
    const rail = scrollerRef.current;
    if (!rail) {
      return;
    }

    const maximumScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const boundaryTolerance = 2;
    const nextScrollState = {
      ready: true,
      canScrollPrevious: rail.scrollLeft > boundaryTolerance,
      canScrollNext:
        maximumScrollLeft > boundaryTolerance &&
        rail.scrollLeft < maximumScrollLeft - boundaryTolerance,
    };
    setScrollState(previousScrollState =>
      previousScrollState.ready === nextScrollState.ready &&
      previousScrollState.canScrollPrevious ===
        nextScrollState.canScrollPrevious &&
      previousScrollState.canScrollNext === nextScrollState.canScrollNext
        ? previousScrollState
        : nextScrollState
    );
  }, []);

  useEffect(() => {
    const rail = scrollerRef.current;
    if (!rail) {
      return;
    }

    measureScrollState();
    rail.addEventListener('scroll', measureScrollState, { passive: true });
    window.addEventListener('resize', measureScrollState);
    const resizeObserver = new ResizeObserver(measureScrollState);
    resizeObserver.observe(rail);

    return () => {
      rail.removeEventListener('scroll', measureScrollState);
      window.removeEventListener('resize', measureScrollState);
      resizeObserver.disconnect();
    };
  }, [measureScrollState]);

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
        disabled={!scrollState.canScrollPrevious}
        aria-controls={railId}
        aria-label={previousLabel}
        onClick={() => {
          scrollByDirection('prev');
        }}
        className='marketing-snap-rail__nav-btn pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-xl transition-colors disabled:cursor-default disabled:opacity-35'
      >
        <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      </button>
      <button
        type='button'
        disabled={!scrollState.canScrollNext}
        aria-controls={railId}
        aria-label={nextLabel}
        onClick={() => {
          scrollByDirection('next');
        }}
        className='marketing-snap-rail__nav-btn pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-xl transition-colors disabled:cursor-default disabled:opacity-35'
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
        {showDesktopControls && !overlayControlsOnDesktop ? (
          <div
            className={cn(
              'marketing-snap-rail__controls pointer-events-none mb-4 hidden items-center justify-end gap-2 pr-5 sm:pr-6 lg:flex lg:pr-[max(1.5rem,calc((100vw-var(--public-content-max-page))/2))]',
              !scrollState.ready ||
                (!scrollState.canScrollPrevious && !scrollState.canScrollNext)
                ? 'invisible'
                : null
            )}
          >
            {navButtons}
          </div>
        ) : showDesktopControls ? (
          <div
            className={cn(
              'marketing-snap-rail__controls marketing-snap-rail__controls--overlay pointer-events-none absolute right-[max(1.25rem,calc((100vw-var(--public-content-max-page))/2))] top-4 z-20 hidden items-center gap-2 lg:flex',
              !scrollState.ready ||
                (!scrollState.canScrollPrevious && !scrollState.canScrollNext)
                ? 'invisible'
                : null
            )}
          >
            {navButtons}
          </div>
        ) : null}

        {showMobileControls ? (
          <div
            className={cn(
              'marketing-snap-rail__mobile-controls mb-4 flex items-center justify-end gap-2',
              showDesktopControls ? 'lg:hidden' : 'md:hidden',
              !scrollState.ready ||
                (!scrollState.canScrollPrevious && !scrollState.canScrollNext)
                ? 'invisible'
                : null
            )}
          >
            {navButtons}
          </div>
        ) : null}

        {!showMobileControls ? (
          <div className='hidden sm:block lg:hidden'>
            <div className='sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-6 focus-within:top-4 focus-within:z-20 focus-within:flex focus-within:gap-2'>
              <button
                type='button'
                disabled={!scrollState.canScrollPrevious}
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
                disabled={!scrollState.canScrollNext}
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
        ) : null}

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
