'use client';

import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import { useMemo } from 'react';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import {
  PLATFORM_LABELS,
  PRIMARY_GOAL_LABELS,
  STATUS_VARIANTS,
} from './constants';
import type { ApproveStatus, Column } from './types';

interface UseWaitlistColumnsProps {
  approveStatuses: Record<string, ApproveStatus>;
  onApprove: (entryId: string) => void;
}

export function useWaitlistColumns({
  approveStatuses,
  onApprove,
}: UseWaitlistColumnsProps): Column<WaitlistEntryRow>[] {
  return useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: entry => (
          <span className='font-medium text-primary-token'>
            {entry.fullName}
          </span>
        ),
        width: 'w-[180px]',
      },
      {
        id: 'email',
        header: 'Email',
        cell: entry => (
          <a
            href={`mailto:${entry.email}`}
            className='text-secondary-token hover:underline'
          >
            {entry.email}
          </a>
        ),
        width: 'w-[220px]',
        hideOnMobile: true,
      },
      {
        id: 'primaryGoal',
        header: 'Primary goal',
        cell: entry => {
          const primaryGoalLabel = entry.primaryGoal
            ? (PRIMARY_GOAL_LABELS[entry.primaryGoal] ?? entry.primaryGoal)
            : null;
          return primaryGoalLabel ? (
            <Badge size='sm' variant='secondary'>
              {primaryGoalLabel}
            </Badge>
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        width: 'w-[140px]',
        hideOnMobile: true,
      },
      {
        id: 'primarySocial',
        header: 'Primary Social',
        cell: entry => {
          const platformLabel =
            PLATFORM_LABELS[entry.primarySocialPlatform] ??
            entry.primarySocialPlatform;
          return (
            <div className='flex items-center gap-2'>
              <Badge size='sm' variant='secondary'>
                {platformLabel}
              </Badge>
              <a
                href={entry.primarySocialUrlNormalized}
                target='_blank'
                rel='noopener noreferrer'
                className='text-accent hover:underline text-xs line-clamp-1 overflow-hidden text-ellipsis max-w-[220px]'
              >
                {entry.primarySocialUrlNormalized.replace(/^https?:\/\//, '')}
              </a>
            </div>
          );
        },
        width: 'w-[280px]',
        hideOnMobile: true,
      },
      {
        id: 'spotify',
        header: 'Spotify',
        cell: entry =>
          entry.spotifyUrlNormalized ? (
            <a
              href={entry.spotifyUrlNormalized}
              target='_blank'
              rel='noopener noreferrer'
              className='text-accent hover:underline text-xs line-clamp-1 overflow-hidden text-ellipsis max-w-[220px] block'
            >
              {entry.spotifyUrlNormalized.replace(/^https?:\/\//, '')}
            </a>
          ) : (
            <span className='text-tertiary-token'>—</span>
          ),
        width: 'w-[200px]',
        hideOnMobile: true,
      },
      {
        id: 'heardAbout',
        header: 'Heard About',
        cell: entry => {
          if (!entry.heardAbout) {
            return <span className='text-tertiary-token'>—</span>;
          }
          if (entry.heardAbout.length > 30) {
            const heardAboutTruncated = entry.heardAbout.slice(0, 30) + '…';
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='cursor-help text-secondary-token'>
                    {heardAboutTruncated}
                  </span>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  {entry.heardAbout}
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <span className='text-secondary-token'>{entry.heardAbout}</span>
          );
        },
        width: 'w-[160px]',
        hideOnMobile: true,
      },
      {
        id: 'status',
        header: 'Status',
        cell: entry => {
          const statusVariant = STATUS_VARIANTS[entry.status] ?? 'secondary';
          return (
            <Badge size='sm' variant={statusVariant}>
              {entry.status}
            </Badge>
          );
        },
        width: 'w-[110px]',
      },
      {
        id: 'created',
        header: 'Created',
        cell: entry =>
          entry.createdAt
            ? new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(entry.createdAt)
            : '—',
        width: 'w-[160px]',
        hideOnMobile: true,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: entry => {
          const isApproved =
            entry.status === 'invited' || entry.status === 'claimed';
          const approveStatus = approveStatuses[entry.id] ?? 'idle';
          const isApproving = approveStatus === 'loading';

          return (
            <div className='flex items-center justify-end gap-2'>
              <Button
                size='sm'
                variant='secondary'
                disabled={isApproved || isApproving}
                onClick={() => {
                  Promise.resolve(onApprove(entry.id)).catch(() => {});
                }}
              >
                {(() => {
                  if (isApproved) return 'Approved';
                  if (isApproving) return 'Approving…';
                  return 'Approve';
                })()}
              </Button>
            </div>
          );
        },
        align: 'right',
        width: 'w-[120px]',
      },
    ],
    [approveStatuses, onApprove]
  );
}
