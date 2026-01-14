'use client';

/**
 * Featured Artists Drift Row Component
 *
 * Parallax row of featured creators with scroll-based animation,
 * using TanStack Pacer for throttled scroll and resize handling.
 *
 * @see https://tanstack.com/pacer
 */

import { useThrottler } from '@tanstack/react-pacer';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { FeaturedCreator } from '@/components/organisms/FeaturedArtistsSection';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { PACER_TIMING } from '@/lib/pacer/hooks';

export interface FeaturedArtistsDriftRowProps {
  creators: FeaturedCreator[];
  showFades?: boolean;
}

const MAX_SHIFT_PX = 56;

export function FeaturedArtistsDriftRow({
  creators,
  showFades = true,
}: FeaturedArtistsDriftRowProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const shiftPxRef = useRef<number>(0);

  // TanStack Pacer throttler for scroll/resize events
  const throttler = useThrottler(
    () => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const denom = viewportH + rect.height;

      if (denom <= 0) {
        shiftPxRef.current = 0;
        if (rowRef.current) {
          rowRef.current.style.transform = '';
        }
        return;
      }

      const rawProgress = (viewportH - rect.top) / denom;
      const progress = Math.max(0, Math.min(1, rawProgress));
      const nextShift = Math.round(progress * MAX_SHIFT_PX);

      if (shiftPxRef.current !== nextShift) {
        shiftPxRef.current = nextShift;
        if (rowRef.current) {
          rowRef.current.style.transform = `translate3d(${-nextShift}px, 0, 0)`;
        }
      }
    },
    { wait: PACER_TIMING.SCROLL_THROTTLE_MS, leading: true, trailing: true }
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      shiftPxRef.current = 0;
      if (rowRef.current) {
        rowRef.current.style.transform = '';
      }
      return;
    }

    const onScrollOrResize = () => {
      throttler.maybeExecute();
    };

    // Initial update
    throttler.maybeExecute();

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      throttler.cancel();
    };
  }, [prefersReducedMotion, throttler]);

  return (
    <div className='relative w-full'>
      <div
        ref={containerRef}
        className='w-full overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        <div
          ref={rowRef}
          className='flex flex-nowrap items-center justify-start gap-8 sm:gap-10 px-4 sm:px-6 lg:px-8 py-2 w-max will-change-transform'
        >
          {creators.map(creator => (
            <Link
              key={creator.id}
              href={`/${creator.handle}`}
              aria-label={`View ${creator.name}'s profile (@${creator.handle})`}
              title={creator.name}
              className='group flex flex-col items-center'
            >
              <div className='relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-neutral-200 dark:border-neutral-800 group-hover:border-neutral-400 dark:group-hover:border-neutral-600 transition-colors'>
                <Image
                  src={creator.src}
                  alt={creator.alt || creator.name}
                  fill
                  className='object-cover'
                />
              </div>
              <span className='sr-only'>{creator.name}</span>
              <span className='sr-only'>@{creator.handle}</span>
            </Link>
          ))}
        </div>
      </div>

      {showFades ? (
        <>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-14 bg-linear-to-r from-(--color-bg-base) to-transparent'
          />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-14 bg-linear-to-l from-(--color-bg-base) to-transparent'
          />
        </>
      ) : null}
    </div>
  );
}
