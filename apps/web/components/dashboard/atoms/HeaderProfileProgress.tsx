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

  if (
    !selectedProfile ||
    profileCompletion.percentage >= 100 ||
    profileCompletion.steps.length === 0
  ) {
    return null;
  }

  const pct = profileCompletion.percentage;
  // SVG circular progress: radius 14, circumference ~88
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label={`Profile ${pct}% complete — click to finish setup`}
      className='group relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-secondary-token transition-colors hover:bg-surface-2/60 hover:text-primary-token'
    >
      <svg
        width='28'
        height='28'
        viewBox='0 0 32 32'
        className='shrink-0 -rotate-90'
        aria-hidden='true'
      >
        {/* Background ring */}
        <circle
          cx='16'
          cy='16'
          r={r}
          fill='none'
          stroke='currentColor'
          strokeWidth='3'
          className='text-surface-3'
        />
        {/* Progress ring */}
        <circle
          cx='16'
          cy='16'
          r={r}
          fill='none'
          stroke='url(#progress-gradient)'
          strokeWidth='3'
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className='transition-[stroke-dashoffset] duration-500'
        />
        <defs>
          <linearGradient
            id='progress-gradient'
            x1='0%'
            y1='0%'
            x2='100%'
            y2='100%'
          >
            <stop offset='0%' stopColor='var(--color-brand-400)' />
            <stop offset='100%' stopColor='var(--color-brand-500)' />
          </linearGradient>
        </defs>
      </svg>
      <span className='tabular-nums hidden sm:inline'>{pct}%</span>
    </button>
  );
});
