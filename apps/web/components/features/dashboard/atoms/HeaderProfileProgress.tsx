'use client';

import { useRouter } from 'next/navigation';
import { memo, useCallback } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Compact profile completion indicator for the dashboard header.
 * Shows a circular progress ring with percentage. Clicking navigates
 * to chat with a pre-filled prompt to complete the profile.
 */
export const HeaderProfileProgress = memo(function HeaderProfileProgress() {
  const { selectedProfile, profileCompletion } = useDashboardData();
  const router = useRouter();

  const handleClick = useCallback(() => {
    const prompt = encodeURIComponent(
      'Help me complete my profile. What steps are remaining?'
    );
    router.push(`${APP_ROUTES.CHAT}?q=${prompt}`);
  }, [router]);

  const completionPercentage = profileCompletion?.percentage ?? 0;
  const completionSteps = profileCompletion?.steps ?? [];

  if (
    !selectedProfile ||
    completionPercentage >= 100 ||
    completionSteps.length === 0
  ) {
    return null;
  }

  const pct = completionPercentage;
  // SVG circular progress: compact header size (radius 9, circumference ~57)
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label={`Profile ${pct}% complete. Open chat for a guided completion plan.`}
      className='group relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-caption text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
    >
      <svg
        width='20'
        height='20'
        viewBox='0 0 24 24'
        className='shrink-0 -rotate-90'
        aria-hidden='true'
      >
        {/* Background ring */}
        <circle
          cx='12'
          cy='12'
          r={r}
          fill='none'
          stroke='currentColor'
          strokeWidth='2.5'
          className='text-border-subtle'
        />
        {/* Progress ring */}
        <circle
          cx='12'
          cy='12'
          r={r}
          fill='none'
          stroke='currentColor'
          strokeWidth='2.5'
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className='text-accent transition-[stroke-dashoffset,color] duration-500 group-hover:text-accent-hover'
        />
      </svg>
      <span className='max-sm:hidden sm:inline text-[11px] text-secondary-token'>
        Profile
      </span>
      <span className='text-[11px] tabular-nums text-primary-token'>
        {pct}%
      </span>
    </button>
  );
});
