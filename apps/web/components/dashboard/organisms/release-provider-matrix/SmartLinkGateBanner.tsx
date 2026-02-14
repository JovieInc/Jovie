'use client';

import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface SmartLinkGateBannerProps {
  /** Total number of releases the user has */
  readonly totalReleases: number;
  /** Number of smart links available on the free plan */
  readonly smartLinksLimit: number;
  readonly className?: string;
}

/**
 * Banner shown to free-tier users when they have more releases than the
 * smart link limit. Highlights the value of auto-created smart links
 * and encourages upgrading.
 */
export function SmartLinkGateBanner({
  totalReleases,
  smartLinksLimit,
  className,
}: SmartLinkGateBannerProps) {
  // ~20 minutes saved per auto-created smart link
  const minutesSaved = totalReleases * 20;
  const hoursSaved = Math.round(minutesSaved / 60);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-3',
        className
      )}
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
          We auto-created all {totalReleases} smart links for you
        </p>
        <p className='mt-0.5 text-xs text-secondary-token'>
          {smartLinksLimit} are active on your free plan.{' '}
          <Link
            href='/pricing'
            className='font-medium text-primary underline-offset-2 hover:underline'
          >
            Upgrade to Pro
          </Link>{' '}
          to unlock all {totalReleases}
          {hoursSaved > 0 && ` and save ~${hoursSaved}h of setup`}.
        </p>
      </div>
    </div>
  );
}
