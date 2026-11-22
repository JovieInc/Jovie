'use client';

import { JovieO } from '@jovie/ui/brand';
import { useEffect, useState } from 'react';
import { BRAND_MARK_MUTED_CLASS } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';

// Delay before showing loading message (milliseconds)
const LOADING_MESSAGE_DELAY_MS = 2000;
// The loading turn is capped: 3 turns of --duration-o-turn (1250 ms), then
// the mark holds still. Under reduced motion the CSS never animates at all.
const LOADING_TURN_MS = 1250;
const LOADING_TURN_CAP = 3;
const LOADING_TURNS_MS = LOADING_TURN_MS * LOADING_TURN_CAP;

/**
 * AuthLoader - Loading state for authenticated pages
 *
 * Renders inside the main content area (not full page).
 * One muted, decorative O (the same value as BrandLogo tone='muted') that
 * turns at most three times, then holds still. The live region says
 * "Loading"; the visual text stays hidden for two seconds.
 */
export function AuthLoader() {
  const [showMessage, setShowMessage] = useState(false);
  const [turning, setTurning] = useState(true);

  useEffect(() => {
    const message = setTimeout(
      () => setShowMessage(true),
      LOADING_MESSAGE_DELAY_MS
    );
    const settle = setTimeout(() => setTurning(false), LOADING_TURNS_MS);
    return () => {
      clearTimeout(message);
      clearTimeout(settle);
    };
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
        <JovieO
          size={24}
          state={turning ? 'loading' : 'idle'}
          className={BRAND_MARK_MUTED_CLASS}
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
