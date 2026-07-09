'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { env } from '@/lib/env-client';
import { useUsageSummaryQuery } from '@/lib/queries';
import { formatResetDay, formatResetIn } from '@/lib/usage/limits';

/**
 * Subtle top-right usage pill + limits popover (Opportunity Inbox home).
 *
 * Quiet, glanceable chrome: the pill shows the overall remaining percent
 * (the tighter of the weekly suggestions and 5-hr live-actions quotas).
 * Click opens a popover with both quotas, their resets, and a link to the
 * full usage page. Doubles as an upgrade entry point.
 *
 * Layout-shift guard: the pill reserves its footprint while loading
 * (invisible placeholder value) and uses tabular numerals with a fixed
 * min-width so value updates never reflow the header.
 */

const PILL_CLASSES =
  'inline-flex min-w-14 items-center justify-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2.5 py-1.5 text-app font-caption text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token';

export const HeaderUsagePill = memo(function HeaderUsagePill() {
  const pathname = usePathname();
  const isPassiveRuntime = env.IS_E2E;
  const isDemoRoute = isDemoRoutePath(pathname);
  const { data } = useUsageSummaryQuery({
    enabled: !isPassiveRuntime && !isDemoRoute,
  });

  if (isPassiveRuntime || isDemoRoute) {
    return null;
  }

  if (!data) {
    // Reserve the pill's footprint while loading so the header never shifts.
    return (
      <span
        className={PILL_CLASSES}
        aria-hidden
        data-testid='usage-pill-loading'
      >
        <span className='tabular-nums opacity-0'>100%</span>
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          className={PILL_CLASSES}
          aria-label={`Jovie usage: ${data.remainingPercent}% remaining. Open usage details.`}
          data-testid='usage-pill'
        >
          <span className='tabular-nums'>{data.remainingPercent}%</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 p-0' testId='usage-popover'>
        <div className='border-b border-subtle px-4 py-3'>
          <p className='text-app font-caption font-medium text-primary-token'>
            Jovie Usage · {data.planDisplayName}
          </p>
        </div>
        <dl className='space-y-3 px-4 py-3'>
          <div className='flex items-baseline justify-between gap-3'>
            <dt className='text-app font-caption text-primary-token'>
              Suggestions
            </dt>
            <dd className='text-right text-app font-caption text-secondary-token'>
              <span className='tabular-nums'>
                This week · {data.suggestions.remainingPercent}% left
              </span>
              <span className='block text-tertiary-token'>
                Resets {formatResetDay(data.suggestions.resetAt)}
              </span>
            </dd>
          </div>
          <div className='flex items-baseline justify-between gap-3'>
            <dt className='text-app font-caption text-primary-token'>
              Live actions
            </dt>
            <dd className='text-right text-app font-caption text-secondary-token'>
              <span className='tabular-nums'>
                5-hr window · {data.liveActions.used}/{data.liveActions.limit}
              </span>
              <span className='block text-tertiary-token'>
                {data.liveActions.resetAt
                  ? `Resets in ${formatResetIn(data.liveActions.resetAt)}`
                  : 'Window clear'}
              </span>
            </dd>
          </div>
        </dl>
        <div className='border-t border-subtle px-4 py-2.5'>
          <Link
            href={APP_ROUTES.SETTINGS_USAGE}
            className='text-app font-caption text-secondary-token transition-colors hover:text-primary-token'
          >
            Learn more about limits
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
});
