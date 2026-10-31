'use client';

import { ChevronRight } from 'lucide-react';
import type {
  OvieBlockerPr,
  OvieInFlightSummary,
} from '@/lib/ovie/home/blockers';
import { cn } from '@/lib/utils';

const MAX_PRS = 3;

function Disclosure({
  label,
  prs,
  moreHref,
  open = false,
  quiet = false,
}: Readonly<{
  readonly label: string;
  readonly prs: readonly OvieBlockerPr[];
  readonly moreHref: string;
  readonly open?: boolean;
  /** Work moving normally: present for the total, never styled as a problem. */
  readonly quiet?: boolean;
}>) {
  return (
    <details
      open={open}
      className='group rounded-lg bg-surface-1'
      data-testid={quiet ? 'ovie-moving-group' : 'ovie-blocker-group'}
    >
      <summary className='flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'>
        <ChevronRight
          aria-hidden='true'
          className='size-3.5 shrink-0 text-tertiary-token transition-transform duration-subtle group-open:rotate-90'
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            quiet ? 'text-secondary-token' : 'text-primary-token'
          )}
        >
          {label}
        </span>
        <span className='shrink-0 text-xs text-secondary-token tabular-nums'>
          {prs.length} {prs.length === 1 ? 'PR' : 'PRs'}
        </span>
      </summary>
      <ul className='flex flex-col gap-1 px-3 pb-2 pl-8'>
        {prs.slice(0, MAX_PRS).map(pr => (
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
        {prs.length > MAX_PRS ? (
          <li className='text-xs'>
            <a
              href={moreHref}
              className='text-tertiary-token underline-offset-2 hover:text-primary-token hover:underline'
            >
              {`+${prs.length - MAX_PRS} more on Shipping`}
            </a>
          </li>
        ) : null}
      </ul>
    </details>
  );
}

/**
 * Home's In Flight: why work is stuck, one disclosure per reason (largest
 * open), then the work moving normally, so the rows always add up to the
 * total. The full board is on Shipping.
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
      <p className='text-sm text-primary-token tabular-nums'>
        {summary.stuck} stuck, {summary.moving} moving.{' '}
        <a
          href={moreHref}
          className='text-xs text-secondary-token underline underline-offset-2 hover:text-primary-token'
        >
          Open board
        </a>
      </p>
      {summary.groups.length === 0 ? (
        <p className='text-sm text-secondary-token'>Nothing is stuck.</p>
      ) : null}
      <ul className='flex min-h-0 flex-col gap-1.5 overflow-hidden'>
        {summary.groups.map((group, index) => (
          <li key={group.reason}>
            <Disclosure
              label={group.reason}
              prs={group.prs}
              moreHref={moreHref}
              open={index === 0}
            />
          </li>
        ))}
        {summary.movingPrs.length > 0 ? (
          <li>
            <Disclosure
              label='Moving Normally'
              prs={summary.movingPrs}
              moreHref={moreHref}
              quiet
            />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
