'use client';

import type { InsightResponse } from '@/types/insights';
import { buildGreeting } from '../lib/greeting';
import type { ArtistContext } from '../types';

interface JovieGreetingProps {
  readonly displayName?: string;
  readonly username?: string;
  readonly isFirstSession: boolean;
  readonly insights: readonly InsightResponse[];
  readonly tippingStats: ArtistContext['tippingStats'];
}

export function JovieGreeting({
  displayName,
  username,
  isFirstSession,
  insights,
  tippingStats,
}: JovieGreetingProps) {
  const greeting = buildGreeting({
    displayName,
    username,
    isFirstSession,
    insights,
    tippingStats,
  });

  return (
    <div className='rounded-[14px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-3.5 text-center'>
      <p className='text-[11px] font-[560] tracking-normal text-tertiary-token'>
        {greeting.label}
      </p>
      <p className='mt-2 text-[15px] leading-6 text-secondary-token'>
        {greeting.body}{' '}
        {greeting.profileHref && greeting.profileLabel ? (
          <>
            <a
              href={greeting.profileHref}
              target='_blank'
              rel='noreferrer'
              className='font-medium text-primary-token underline-offset-2 hover:underline'
            >
              {greeting.profileLabel}
            </a>
            {'.'}
          </>
        ) : null}
      </p>
    </div>
  );
}
