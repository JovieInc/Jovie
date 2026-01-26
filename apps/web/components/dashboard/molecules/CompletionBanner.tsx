'use client';

import { CheckCircle, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
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
      <DashboardCard
        variant='analytics'
        hover={false}
        padding='compact'
        className='flex items-start gap-3'
      >
        <div
          className='shrink-0 rounded-full border border-subtle bg-surface-2/50 p-2 ring-1 ring-inset ring-white/5 dark:ring-white/10'
          aria-hidden='true'
        >
          <CheckCircle className='h-5 w-5 text-success' />
        </div>
        <div className='min-w-0 flex-1 space-y-1'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
            Setup complete
          </p>
          <p className='text-sm font-semibold leading-5 text-primary-token'>
            Your profile is ready
          </p>
          <p className='text-sm leading-5 text-secondary-token'>
            You&apos;ve completed all the essential setup steps.
          </p>
        </div>
        <button
          type='button'
          onClick={handleDismiss}
          aria-label='Dismiss banner'
          className='shrink-0 rounded-full border border-subtle bg-transparent p-1.5 text-tertiary-token transition-colors hover:bg-surface-2/40 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </button>
      </DashboardCard>
    );
  }
);
