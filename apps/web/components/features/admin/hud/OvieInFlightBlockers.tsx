'use client';

import { ChevronRight } from 'lucide-react';
import type { OvieInFlightSummary } from '@/lib/ovie/home/blockers';

const MAX_PRS = 5;

/**
 * Home's In Flight: the reasons work is stuck, each a disclosure listing
 * the PRs it holds. Moving work is one line; the full board is on Shipping.
 */
export function OvieInFlightBlockers({
  summary,
  moreHref,
}: Readonly<{
  readonly summary: OvieInFlightSummary;
  readonly moreHref: string;
}>) {
  return (
    <div
      className='flex min-h-0 flex-1 flex-col gap-2'
      data-testid='ovie-in-flight-blockers'
    >
      <p className='text-xs text-secondary-token tabular-nums'>
        {summary.stuck} stuck · {summary.moving} moving ·{' '}
        <a
          href={moreHref}
          className='underline-offset-2 hover:text-primary-token hover:underline focus-visible:underline'
        >
          Open board
        </a>
      </p>
      {summary.groups.length === 0 ? (
        <p className='text-sm text-secondary-token'>Nothing is stuck.</p>
      ) : (
        <ul className='flex min-h-0 flex-col gap-1.5 overflow-hidden'>
          {summary.groups.map(group => (
            <li key={group.reason}>
              <details
                className='group rounded-lg bg-surface-1'
                data-testid='ovie-blocker-group'
              >
                <summary className='flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'>
                  <ChevronRight
                    aria-hidden='true'
                    className='size-3.5 shrink-0 text-tertiary-token transition-transform duration-subtle group-open:rotate-90'
                  />
                  <span className='min-w-0 flex-1 truncate'>
                    {group.reason}
                  </span>
                  <span className='shrink-0 text-xs text-secondary-token tabular-nums'>
                    {group.count} {group.count === 1 ? 'PR' : 'PRs'}
                  </span>
                </summary>
                <ul className='flex flex-col gap-1 px-3 pb-2 pl-8'>
                  {group.prs.slice(0, MAX_PRS).map(pr => (
                    <li key={pr.id} className='truncate text-xs'>
                      {pr.url ? (
                        <a
                          href={pr.url}
                          className='text-secondary-token underline-offset-2 hover:text-primary-token hover:underline focus-visible:underline'
                        >
                          {pr.label}
                        </a>
                      ) : (
                        <span className='text-secondary-token'>{pr.label}</span>
                      )}
                    </li>
                  ))}
                  {group.prs.length > MAX_PRS ? (
                    <li className='text-xs'>
                      <a
                        href={moreHref}
                        className='text-tertiary-token underline-offset-2 hover:text-primary-token hover:underline'
                      >
                        {`+${group.prs.length - MAX_PRS} more on Shipping`}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
