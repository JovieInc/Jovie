'use client';

import { Clock, ExternalLink, Lock } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { formatStreams } from '@/lib/format-streams';

export type ShellRowLockReason = 'scheduled' | 'cap' | null;

export const SmartLinkCell = memo(function SmartLinkCell({
  release,
  smartLinkLockReason,
  smartLinkPath,
}: {
  readonly release: ReleaseViewModel;
  readonly smartLinkLockReason: ShellRowLockReason;
  readonly smartLinkPath: string;
}) {
  const isLocked = smartLinkLockReason !== null;
  const isScheduled = smartLinkLockReason === 'scheduled';

  if (isLocked) {
    return (
      <span
        role='img'
        aria-label={
          isScheduled
            ? `Scheduled smart link (Pro) for ${release.title}`
            : `Smart link locked (Pro) for ${release.title}`
        }
        title={
          isScheduled
            ? 'Pre-release smart link requires Pro'
            : 'Smart link locked — upgrade for more'
        }
        data-shell-release-smart-link-locked='true'
        data-shell-release-smart-link-lock-reason={smartLinkLockReason}
        className='shrink-0 h-7 w-7 rounded-full grid place-items-center text-quaternary-token cursor-not-allowed'
      >
        {isScheduled ? (
          <Clock
            className='h-3.5 w-3.5'
            strokeWidth={2.25}
            aria-hidden='true'
          />
        ) : (
          <Lock className='h-3.5 w-3.5' strokeWidth={2.25} aria-hidden='true' />
        )}
      </span>
    );
  }

  return (
    <Link
      href={smartLinkPath}
      prefetch={false}
      target='_blank'
      rel='noreferrer'
      onClick={e => e.stopPropagation()}
      title={`Open smart link · ${smartLinkPath}`}
      aria-label={`Open smart link for ${release.title}`}
      className='relative shrink-0 grid h-7 w-7 place-items-center rounded-full text-quaternary-token transition-colors duration-subtle ease-subtle before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-empty hover:bg-surface-2/70 hover:text-primary-token'
    >
      <ExternalLink className='h-3.5 w-3.5' strokeWidth={2.25} />
    </Link>
  );
});

/** Weekly smart-link clicks; quiet em dash when the release has no data. */
export const WeeklyStreamsCell = memo(function WeeklyStreamsCell({
  weeklyStreams,
}: {
  readonly weeklyStreams: number | null | undefined;
}) {
  const hasData = typeof weeklyStreams === 'number' && weeklyStreams > 0;

  return (
    <div
      className='hidden w-20 shrink-0 items-center justify-end xl:inline-flex'
      title={
        hasData
          ? `${weeklyStreams.toLocaleString()} smart-link clicks this week`
          : 'No weekly activity recorded yet'
      }
      data-testid='shell-release-weekly-streams'
      data-app-table-cell='numeric'
    >
      {hasData ? (
        <span className='whitespace-nowrap text-2xs leading-none tabular-nums text-tertiary-token'>
          {formatStreams(weeklyStreams)}
          <span className='text-quaternary-token'> / wk</span>
        </span>
      ) : (
        <span className='text-2xs leading-none text-quaternary-token'>—</span>
      )}
    </div>
  );
});
