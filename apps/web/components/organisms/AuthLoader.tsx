'use client';

import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * AuthLoader - Loading state for authenticated pages
 *
 * Renders inside the main content area (not full page)
 * Shows a centered logo with optional loading message
 */
export function AuthLoader() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    // Show additional message after 2 seconds if still loading
    const timer = setTimeout(() => setShowMessage(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='flex h-full w-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3'>
        <BrandLogo size={40} className='animate-pulse' />
        <p
          className={`text-xs text-secondary-token transition-opacity duration-300 ${
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
