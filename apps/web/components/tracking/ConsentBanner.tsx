'use client';

import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  type ConsentState,
  getConsentState,
  isGPCEnabled,
  setConsentState as persistConsentState,
} from '@/lib/tracking/consent';
import { cn } from '@/lib/utils';

interface ConsentBannerProps {
  readonly className?: string;
}

const secondaryButtonStyle: CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--linear-text-secondary)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '4px 10px',
  borderRadius: 'var(--linear-radius-sm)',
  height: '28px',
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-btn-primary-bg)',
  color: 'var(--linear-btn-primary-fg)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '4px 10px',
  borderRadius: 'var(--linear-radius-sm)',
  height: '28px',
};

/**
 * Minimal consent banner for pixel tracking.
 * Automatically respects GPC (Global Privacy Control) signals.
 * Only shown when consent state is undecided.
 */
export function ConsentBanner({ className }: ConsentBannerProps) {
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check consent state on mount
    const state = getConsentState();
    setConsentState(state);

    // Only show banner if undecided (not GPC, not already decided)
    if (state === 'undecided') {
      // Small delay to avoid layout shift on initial load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    persistConsentState('accepted');
    setConsentState('accepted');
    setIsVisible(false);
  };

  const handleReject = () => {
    persistConsentState('rejected');
    setConsentState('rejected');
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
        'backdrop-blur-sm',
        'px-4 py-2.5',
        'animate-in slide-in-from-bottom-4 duration-300',
        className
      )}
      style={{
        backgroundColor:
          'color-mix(in oklch, var(--linear-bg-surface-0) 95%, transparent)',
        borderTop: '1px solid var(--linear-border-subtle)',
        boxShadow: 'var(--linear-shadow-card)',
      }}
      aria-label='Cookie consent'
    >
      <div
        className='max-w-screen-lg mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between'
        style={{ gap: '10px' }}
      >
        <p
          className='flex-1'
          style={{
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--linear-text-secondary)',
          }}
        >
          We use cookies to understand how you use this page and improve your
          experience.{' '}
          <a
            href='/privacy'
            className='underline hover:opacity-80'
            style={{ color: 'var(--linear-text-primary)' }}
            target='_blank'
            rel='noopener noreferrer'
          >
            Learn more
          </a>
        </p>

        <div
          className='flex items-center shrink-0'
          style={{ gap: 'var(--linear-space-2)' }}
        >
          <button
            type='button'
            onClick={handleReject}
            className='transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
            style={secondaryButtonStyle}
          >
            Decline
          </button>
          <button
            type='button'
            onClick={handleAccept}
            className='transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
            style={primaryButtonStyle}
          >
            Accept
          </button>
          <button
            type='button'
            onClick={handleReject}
            className='h-8 w-8 sm:hidden flex items-center justify-center transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
            style={{
              color: 'var(--linear-text-secondary)',
              borderRadius: 'var(--linear-radius-sm)',
            }}
            aria-label='Close'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>
    </dialog>
  );
}
