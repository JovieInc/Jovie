'use client';

import { CheckCircle, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { captureWarning } from '@/lib/error-tracking';

const COMPLETION_BANNER_STORAGE_KEY =
  'jovie_dashboard_completion_banner_dismissed_v1';

export const CompletionBanner = memo(
  function CompletionBanner(): React.ReactElement | null {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
      try {
        const stored = localStorage.getItem(COMPLETION_BANNER_STORAGE_KEY);
        if (stored === '1') {
          setDismissed(true);
        }
      } catch {
        captureWarning('[CompletionBanner] Failed to read localStorage');
      }
    }, []);

    const handleDismiss = useCallback(() => {
      setDismissed(true);
      try {
        localStorage.setItem(COMPLETION_BANNER_STORAGE_KEY, '1');
      } catch {
        captureWarning('[CompletionBanner] Failed to set localStorage');
      }
    }, []);

    if (dismissed) {
      return null;
    }

    return (
      <ContentSurfaceCard className='flex items-start gap-3 p-4'>
        <div
          className='shrink-0 rounded-full border border-subtle bg-surface-0 p-2'
          aria-hidden='true'
        >
          <CheckCircle className='h-5 w-5 text-success' />
        </div>
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='text-[13px] font-[510] tracking-normal text-secondary-token'>
            Setup complete
          </p>
          <p className='text-[14px] font-[590] leading-5 text-primary-token'>
            Your profile is ready
          </p>
          <p className='text-[14px] leading-5 text-secondary-token'>
            You&apos;ve completed all the essential setup steps.
          </p>
        </div>
        <button
          type='button'
          onClick={handleDismiss}
          aria-label='Dismiss banner'
          className='shrink-0 rounded-full border border-subtle bg-transparent p-1.5 text-tertiary-token transition-[background-color,border-color,color,box-shadow] duration-150 hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </button>
      </ContentSurfaceCard>
    );
  }
);
