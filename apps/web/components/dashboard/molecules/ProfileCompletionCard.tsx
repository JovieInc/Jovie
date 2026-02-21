'use client';

import { ArrowRight, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { captureWarning } from '@/lib/error-tracking';

function getStorageKey(profileId: string, percentage: number): string {
  return `jovie_profile_completion_dismissed:${profileId}:${percentage}`;
}

export const ProfileCompletionCard = memo(
  function ProfileCompletionCard(): React.ReactElement | null {
    const { selectedProfile, profileCompletion } = useDashboardData();
    const [dismissed, setDismissed] = useState(false);

    const completionPercentage = profileCompletion?.percentage ?? 0;
    const completionSteps = profileCompletion?.steps ?? [];

    const storageKey = selectedProfile?.id
      ? getStorageKey(selectedProfile.id, completionPercentage)
      : null;

    useEffect(() => {
      if (!storageKey) {
        setDismissed(false);
        return;
      }

      try {
        setDismissed(localStorage.getItem(storageKey) === '1');
      } catch {
        captureWarning('[ProfileCompletionCard] Failed to read localStorage');
      }
    }, [storageKey]);

    const handleDismiss = useCallback(() => {
      if (!storageKey) {
        return;
      }

      setDismissed(true);
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        captureWarning('[ProfileCompletionCard] Failed to set localStorage');
      }
    }, [storageKey]);

    if (
      !selectedProfile ||
      completionPercentage >= 100 ||
      completionSteps.length === 0 ||
      dismissed
    ) {
      return null;
    }

    const primarySteps = completionSteps.slice(0, 3);

    return (
      <DashboardCard variant='analytics' hover={false} className='mb-4 sm:mb-6'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 flex-1 space-y-3'>
            <div className='flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-tertiary-token'>
              <Sparkles className='h-3.5 w-3.5' aria-hidden='true' />
              Profile momentum
            </div>
            <div className='space-y-1'>
              <p className='text-base font-semibold text-primary-token sm:text-lg'>
                Your profile is {completionPercentage}% complete
              </p>
              <p className='text-sm text-secondary-token'>
                You&apos;re close. Finish these next steps to increase trust and
                conversion.
              </p>
            </div>

            <div
              className='h-2 w-full overflow-hidden rounded-full bg-surface-2'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completionPercentage}
              aria-label='Profile completion'
            >
              <div
                className='h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-all duration-500'
                style={{ width: `${completionPercentage}%` }}
              />
            </div>

            <ul className='space-y-2'>
              {primarySteps.map(step => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className='group flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-2/30 px-3 py-2 transition-colors hover:bg-surface-2/60'
                  >
                    <div className='min-w-0'>
                      <p className='text-sm font-medium text-primary-token'>
                        {step.label}
                      </p>
                      <p className='truncate text-xs text-secondary-token'>
                        {step.description}
                      </p>
                    </div>
                    <ArrowRight
                      className='h-4 w-4 shrink-0 text-tertiary-token transition-transform group-hover:translate-x-0.5'
                      aria-hidden='true'
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <button
            type='button'
            onClick={handleDismiss}
            aria-label='Dismiss profile completion card'
            className='shrink-0 rounded-full border border-subtle p-1.5 text-tertiary-token transition-colors hover:bg-surface-2/50 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive'
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </button>
        </div>
      </DashboardCard>
    );
  }
);
