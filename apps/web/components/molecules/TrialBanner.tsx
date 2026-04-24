'use client';

import { X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { usePlanGate } from '@/lib/queries/usePlanGate';
import { cn } from '@/lib/utils';

/**
 * Trial countdown banner shown at the top of the dashboard during an active trial.
 *
 * States:
 * - Active (days 4-14): subtle, dismissable per session
 * - Urgent (days 1-3): accent tint, not dismissable
 * - Final day: strong urgency
 * - Expired/not trialing: hidden
 */
export function TrialBanner() {
  const { isTrialing, trialDaysRemaining, isLoading } = usePlanGate();
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (isLoading || !isTrialing || trialDaysRemaining === null) {
    return null;
  }

  const isUrgent = trialDaysRemaining <= 3;
  const isFinalDay = trialDaysRemaining <= 1;

  // Urgent state is not dismissable
  if (dismissed && !isUrgent) {
    return null;
  }

  const daysText = isFinalDay
    ? 'Last day of your Pro trial.'
    : `${trialDaysRemaining} days left on your Pro trial.`;

  const ctaText = isFinalDay
    ? 'Start your plan to keep everything.'
    : 'End trial and start paid plan today';

  return (
    <ContentSurfaceCard
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5',
        isUrgent && 'border-(--linear-accent)/30 bg-(--linear-accent)/5'
      )}
      role='status'
      aria-live='polite'
    >
      <div className='flex items-center gap-3 text-[13px]'>
        <span className='font-caption text-primary-token'>{daysText}</span>
        <UpgradeButton size='sm'>{ctaText}</UpgradeButton>
      </div>
      {!isUrgent && (
        <button
          type='button'
          onClick={handleDismiss}
          className='shrink-0 text-tertiary-token hover:text-secondary-token transition-colors'
          aria-label='Dismiss trial banner'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      )}
    </ContentSurfaceCard>
  );
}
