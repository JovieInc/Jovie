'use client';

import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface SmartLinkGateBannerProps {
  /** Total number of releases the user has */
  readonly totalReleases: number;
  /** Number of smart links available on the free plan */
  readonly smartLinksLimit: number;
  /** Number of released releases */
  readonly releasedCount: number;
  /** Number of unreleased/scheduled releases */
  readonly unreleasedCount: number;
  readonly className?: string;
}

/**
 * Banner shown to free-tier users when they have more released music than
 * the smart link cap, or when they have unreleased/scheduled releases.
 * Encourages upgrading to Pro.
 */
export function SmartLinkGateBanner({
  totalReleases,
  smartLinksLimit,
  releasedCount,
  unreleasedCount,
  className,
}: SmartLinkGateBannerProps) {
  const overCap = releasedCount > smartLinksLimit;

  return (
    <aside
      className={cn(
        'flex items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-3',
        className
      )}
      aria-label='Smart link upgrade prompt'
    >
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10'>
        <Icon
          name='Sparkles'
          className='h-4 w-4 text-primary'
          aria-hidden='true'
        />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium text-primary-token'>
          {overCap
            ? `${smartLinksLimit} of your ${releasedCount} released songs have active smart links`
            : `Your released music has free smart links`}
        </p>
        <p className='mt-0.5 text-xs text-secondary-token'>
          {overCap && (
            <>
              <Link
                href='/pricing'
                className='font-medium text-primary underline-offset-2 hover:underline'
              >
                Upgrade to Pro
              </Link>{' '}
              to unlock all {releasedCount}.{' '}
            </>
          )}
          {unreleasedCount > 0 && (
            <>
              You have {unreleasedCount} upcoming{' '}
              {unreleasedCount === 1 ? 'release' : 'releases'}.{' '}
              <Link
                href='/pricing'
                className='font-medium text-primary underline-offset-2 hover:underline'
              >
                {overCap ? 'Pro' : 'Upgrade to Pro'}
              </Link>{' '}
              to enable pre-release pages with countdowns and notify-me.
            </>
          )}
        </p>
      </div>
    </aside>
  );
}
