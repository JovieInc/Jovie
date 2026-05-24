'use client';

import { useEffect, useState } from 'react';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';

// Delay before showing loading message (milliseconds)
const LOADING_MESSAGE_DELAY_MS = 2000;

/**
 * AuthLoader - Loading state for authenticated pages
 *
 * Renders inside the main content area (not full page).
 * Shows a centered logo with optional loading message using design system tokens.
 */
export function AuthLoader() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setShowMessage(true),
      LOADING_MESSAGE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='flex h-full w-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3'>
        <JovieMarkElectric size={32} />
        <p
          className={`text-xs text-tertiary-token transition-opacity duration-subtle ${
            showMessage ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden={!showMessage}
        >
          Loading...
        </p>
      </div>
    </div>
  );
}
