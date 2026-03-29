'use client';

import type { InsightResponse } from '@/types/insights';
import { buildGreeting } from '../lib/greeting';
import type { ArtistContext } from '../types';

interface JovieGreetingProps {
  readonly username?: string;
  readonly isFirstSession: boolean;
  readonly insights: readonly InsightResponse[];
  readonly tippingStats: ArtistContext['tippingStats'];
}

export function JovieGreeting({
  username,
  isFirstSession,
  insights,
  tippingStats,
}: JovieGreetingProps) {
  const greeting = buildGreeting({
    username,
    isFirstSession,
    insights,
    tippingStats,
  });

  return (
    <div className='mx-auto max-w-[42rem] rounded-[22px] border border-black/6 bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))] px-5 py-3.5 text-center shadow-[0_1px_0_rgba(255,255,255,0.6)] dark:border-white/8 sm:px-6'>
      <p className='text-[11px] font-[560] tracking-[0.01em] text-tertiary-token'>
        {greeting.label}
      </p>
      <p className='mt-1.5 text-balance text-[15px] leading-6 text-secondary-token'>
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
