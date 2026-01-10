'use client';

import { useEffect, useState } from 'react';
import { LogoIcon } from '@/components/atoms/LogoIcon';

/**
 * Dashboard loading screen
 * Renders a centered logo with fade-in animation to prevent layout shift while data loads.
 */
export default function DashboardLoading() {
  const [showDelayedMessage, setShowDelayedMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDelayedMessage(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='fixed inset-0 flex items-center justify-center bg-base'>
      <div className='flex flex-col items-center gap-4 animate-in fade-in duration-700 ease-out'>
        <LogoIcon
          size={64}
          variant='color'
          className='opacity-40 dark:opacity-30'
        />
        {showDelayedMessage && (
          <p className='text-sm text-secondary-token animate-in fade-in duration-500 ease-out'>
            Setting up your workspace
          </p>
        )}
      </div>
    </div>
  );
}
