'use client';

import { useEffect, useState } from 'react';
import {
  BRAND_MARK_MUTED_CLASS,
  JOVIE_PATH,
  JOVIE_VIEWBOX,
} from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

// Delay before showing loading message (milliseconds)
const LOADING_MESSAGE_DELAY_MS = 2000;
// The turn is capped in CSS: 3 iterations of --duration-o-turn (1250 ms),
// then the mark holds still. Under reduced motion motion-safe: never applies
// and --duration-o-turn is 0ms.
const LOADING_TURN_STYLE = {
  animationDuration: 'var(--duration-o-turn)',
  animationIterationCount: 3,
} as const;

/**
 * AuthLoader - Loading state for authenticated pages
 *
 * Renders inside the main content area (not full page).
 * One static, muted, decorative BrandLogo that turns at most three times, then holds still. The live region says
 * "Loading"; the visual text stays hidden for two seconds.
 */
export function AuthLoader() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const message = setTimeout(
      () => setShowMessage(true),
      LOADING_MESSAGE_DELAY_MS
    );
    return () => clearTimeout(message);
  }, []);

  return (
    <div
      className='flex h-full w-full items-center justify-center'
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label='Loading'
      data-testid='auth-loader'
    >
      <div className='flex flex-col items-center gap-3' aria-hidden='true'>
        {/* The bare O path, not BrandLogo: BrandLogo's per-size masters
            would add about 1 KB of initial JS to every route that loads
            this loader. */}
        <span
          className={cn(
            'inline-flex shrink-0 motion-safe:animate-spin',
            BRAND_MARK_MUTED_CLASS
          )}
          style={LOADING_TURN_STYLE}
          aria-hidden='true'
          data-brand-variant='jovie'
          data-brand-mark-size='24'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox={`0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`}
            width={24}
            height={24}
            fill='currentColor'
            shapeRendering='geometricPrecision'
            aria-hidden='true'
          >
            <path d={JOVIE_PATH} />
          </svg>
        </span>
        <p
          className={cn(
            'text-xs text-tertiary-token transition-opacity duration-subtle',
            showMessage ? 'opacity-100' : 'opacity-0'
          )}
        >
          Loading...
        </p>
      </div>
    </div>
  );
}
