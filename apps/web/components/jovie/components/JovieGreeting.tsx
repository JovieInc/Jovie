'use client';

import { cn } from '@/lib/utils';
import type { InsightResponse } from '@/types/insights';
import { buildGreeting } from '../lib/greeting';
import type { ArtistContext } from '../types';

interface JovieGreetingProps {
  readonly username?: string;
  readonly isFirstSession: boolean;
  readonly insights: readonly InsightResponse[];
  readonly tippingStats: ArtistContext['tippingStats'];
  readonly variant?: 'card' | 'inline';
  readonly className?: string;
}

export function JovieGreeting({
  username,
  isFirstSession,
  insights,
  tippingStats,
  variant = 'card',
  className,
}: JovieGreetingProps) {
  const greeting = buildGreeting({
    username,
    isFirstSession,
    insights,
    tippingStats,
  });

  if (variant === 'inline') {
    return (
      <div className={cn('mx-auto max-w-[34rem] text-center', className)}>
        <p className='text-balance text-[12.5px] leading-5 text-secondary-token sm:text-[13px]'>
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

  return (
    <div
      className={cn(
        'mx-auto max-w-[42rem] rounded-[22px] border border-black/6 bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))] px-5 py-4 text-center dark:border-white/8 sm:px-6',
        className
      )}
    >
      {greeting.label ? (
        <p className='text-[11px] font-semibold tracking-[0.01em] text-tertiary-token'>
          {greeting.label}
        </p>
      ) : null}
      <p
        className={cn(
          'text-balance text-[15px] leading-6 text-secondary-token',
          greeting.label ? 'mt-1.5' : null
        )}
      >
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
