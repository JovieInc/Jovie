'use client';

import { Button } from '@jovie/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type ConsentState,
  getConsentState,
  isGPCEnabled,
  setConsentState,
} from '@/lib/tracking/consent';
import { cn } from '@/lib/utils';

interface ConsentBannerProps {
  readonly className?: string;
}

/**
 * Minimal consent banner for pixel tracking.
 * Automatically respects GPC (Global Privacy Control) signals.
 * Only shown when consent state is undecided.
 */
export function ConsentBanner({ className }: ConsentBannerProps) {
  const [consentState, setLocalConsentState] = useState<ConsentState | null>(
    null
  );
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check consent state on mount
    const state = getConsentState();
    setLocalConsentState(state);

    // Only show banner if undecided (not GPC, not already decided)
    if (state === 'undecided') {
      // Small delay to avoid layout shift on initial load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setConsentState('accepted');
    setLocalConsentState('accepted');
    setIsVisible(false);
  };

  const handleReject = () => {
    setConsentState('rejected');
    setLocalConsentState('rejected');
    setIsVisible(false);
  };

  // Don't render if consent already decided or GPC enabled
  if (consentState !== 'undecided' || !isVisible) {
    return null;
  }

  // If GPC is enabled, don't show banner (auto-rejected)
  if (isGPCEnabled()) {
    return null;
  }

  return (
    <dialog
      open
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-surface-0/95 backdrop-blur-sm border-t border-subtle',
        'px-4 py-3 shadow-lg',
        'animate-in slide-in-from-bottom-4 duration-300',
        className
      )}
      aria-label='Cookie consent'
    >
      <div className='max-w-screen-lg mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3'>
        <p className='text-sm text-secondary-token flex-1'>
          We use cookies to understand how you use this page and improve your
          experience.{' '}
          <a
            href='/privacy'
            className='underline hover:text-primary-token'
            target='_blank'
            rel='noopener noreferrer'
          >
            Learn more
          </a>
        </p>

        <div className='flex items-center gap-2 shrink-0'>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleReject}
            className='text-secondary-token'
          >
            Decline
          </Button>
          <Button variant='primary' size='sm' onClick={handleAccept}>
            Accept
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={handleReject}
            className='h-8 w-8 text-secondary-token sm:hidden'
            aria-label='Close'
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </dialog>
  );
}
