'use client';

import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
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
        <BrandLogo
          size='control'
          tone='muted'
          aria-hidden
          className='motion-safe:animate-spin'
          style={LOADING_TURN_STYLE}
        />
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
