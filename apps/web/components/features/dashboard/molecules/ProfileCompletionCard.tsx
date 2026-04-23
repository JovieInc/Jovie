'use client';

import { AlertCircle, ArrowRight, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    const profileIsLive = profileCompletion?.profileIsLive ?? false;

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
      completionSteps.length === 0
    ) {
      return null;
    }

    // Only allow dismissal if profile is live (has essentials)
    if (dismissed && profileIsLive) {
      return null;
    }

    const primarySteps = completionSteps.slice(0, 3);

    const sectionLabel = profileIsLive ? 'Profile momentum' : 'Finish setup';
    const heading = profileIsLive
      ? `Your profile is ${completionPercentage}% complete`
      : 'Your profile is not live yet';
    const subtext = profileIsLive
      ? 'Finish these steps to increase trust and conversion.'
      : 'Complete these essentials so fans can find you.';

    return (
      <ContentSurfaceCard className='mb-2 border-(--linear-app-frame-seam) p-3.5 sm:mb-3 sm:p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 flex-1 space-y-2'>
            <div className='flex items-center gap-1.5 text-2xs font-[510] tracking-[-0.01em] text-tertiary-token'>
              {profileIsLive ? (
                <Sparkles className='h-3 w-3' aria-hidden='true' />
              ) : (
                <AlertCircle className='h-3 w-3' aria-hidden='true' />
              )}
              {sectionLabel}
            </div>
            <div className='space-y-0.5'>
              <p className='text-app font-[590] text-primary-token'>
                {heading}
              </p>
              <p className='text-app text-secondary-token'>{subtext}</p>
            </div>

            <progress
              className='h-1.5 w-full overflow-hidden rounded-full bg-surface-0 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-0 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-500'
              max={100}
              value={completionPercentage}
              aria-label='Profile completion'
            >
              {completionPercentage}%
            </progress>

            <ul className='space-y-1.5'>
              {primarySteps.map(step => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className='group flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 transition-[background-color,border-color] duration-150 hover:border-(--linear-app-frame-seam) hover:bg-surface-0'
                  >
                    <div className='min-w-0'>
                      <p className='text-app font-[510] text-primary-token'>
                        {step.label}
                      </p>
                      <p className='truncate text-app text-secondary-token'>
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

          {profileIsLive && (
            <button
              type='button'
              onClick={handleDismiss}
              aria-label='Dismiss profile completion card'
              className='shrink-0 rounded-lg border border-(--linear-app-frame-seam) p-1.5 text-tertiary-token transition-[background-color,border-color,color,box-shadow] duration-150 hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </button>
          )}
        </div>
      </ContentSurfaceCard>
    );
  }
);
