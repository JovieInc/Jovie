'use client';

import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

type SmartLinkGateBannerProps = {
  readonly className?: string;
} & (
  | {
      /** Soft-cap mode: all links work, but prompt to request higher limit */
      readonly mode: 'soft-cap';
      readonly releasedCount: number;
      readonly softCap: number;
    }
  | {
      /** Unreleased mode: encourage upgrading for pre-release pages */
      readonly mode: 'unreleased';
      readonly unreleasedCount: number;
    }
);

/**
 * Contextual banner for free-tier users:
 * - soft-cap: shown when released count exceeds the soft cap (100). Links still
 *   work, but the user is prompted to request a higher limit via email.
 * - unreleased: shown when the user has upcoming releases but can't access
 *   pre-release pages. Encourages upgrading to Pro.
 */
export function SmartLinkGateBanner(props: SmartLinkGateBannerProps) {
  const { className, mode } = props;

  return (
    <aside
      className={cn(
        'flex items-start gap-3 rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-3',
        className
      )}
      aria-label={
        mode === 'soft-cap'
          ? 'Smart link limit notice'
          : 'Smart link upgrade prompt'
      }
    >
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10'>
        <Icon
          name='Sparkles'
          className='h-4 w-4 text-primary-token'
          aria-hidden='true'
        />
      </div>
      <div className='min-w-0 flex-1'>
        {mode === 'soft-cap' ? (
          <>
            <p className='text-[13px] font-[510] text-primary-token'>
              You have {props.releasedCount} smart links
            </p>
            <p className='mt-0.5 text-[11px] text-(--linear-text-secondary)'>
              Need more than {props.softCap}?{' '}
              <a
                href='mailto:support@jov.ie?subject=Smart%20link%20limit%20increase%20request'
                className='font-[510] text-primary-token underline-offset-2 hover:underline'
              >
                Request a higher limit
              </a>
            </p>
          </>
        ) : (
          <>
            <p className='text-[13px] font-[510] text-primary-token'>
              You have {props.unreleasedCount} upcoming{' '}
              {props.unreleasedCount === 1 ? 'release' : 'releases'}
            </p>
            <p className='mt-0.5 text-[11px] text-(--linear-text-secondary)'>
              <Link
                href={APP_ROUTES.LAUNCH_PRICING}
                className='font-[510] text-primary-token underline-offset-2 hover:underline'
              >
                Upgrade to Pro
              </Link>{' '}
              to enable pre-release pages with countdowns and notify-me.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
