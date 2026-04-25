'use client';

import { Badge, Button } from '@jovie/ui';
import { Mail } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DateCell } from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { cn } from '@/lib/utils';
import {
  PLATFORM_LABELS,
  PRIMARY_GOAL_LABELS,
  STATUS_VARIANTS,
} from './constants';

export interface WaitlistKanbanCardProps {
  readonly entry: WaitlistEntryRow;
  readonly approveStatus?:
    | 'idle'
    | 'approving'
    | 'disapproving'
    | 'success'
    | 'error';
  readonly onApprove?: () => void;
}

/**
 * WaitlistKanbanCard - Card component for Kanban board view
 *
 * Displays waitlist entry in a compact card format for the board view.
 */
export function WaitlistKanbanCard({
  entry,
  approveStatus = 'idle',
  onApprove,
}: WaitlistKanbanCardProps) {
  const isApproved = entry.status === 'invited' || entry.status === 'claimed';
  const statusVariant = STATUS_VARIANTS[entry.status] ?? 'secondary';
  const platformLabel =
    PLATFORM_LABELS[entry.primarySocialPlatform] ?? entry.primarySocialPlatform;
  const primaryGoalLabel = entry.primaryGoal
    ? (PRIMARY_GOAL_LABELS[entry.primaryGoal] ?? entry.primaryGoal)
    : null;

  return (
    <ContentSurfaceCard
      className={cn(
        'bg-[color-mix(in_oklab,var(--linear-bg-surface-0)_96%,transparent)] p-2.5',
        'transition-[border-color,box-shadow,background-color] duration-150 hover:border-default hover:bg-surface-0',
        'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className='mb-2 flex items-start justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <h4 className='truncate text-app font-semibold text-primary-token'>
            {entry.fullName}
          </h4>
          <a
            href={`mailto:${entry.email}`}
            className='mt-0.5 flex items-center gap-1 text-2xs text-secondary-token hover:text-primary-token'
          >
            <Mail className='h-3 w-3' />
            <span className='truncate'>{entry.email}</span>
          </a>
        </div>
        <Badge size='sm' variant={statusVariant}>
          {entry.status}
        </Badge>
      </div>

      <div className='space-y-1.5 text-2xs'>
        {primaryGoalLabel && (
          <div>
            <span className='text-tertiary-token'>Goal: </span>
            <Badge size='sm' variant='secondary'>
              {primaryGoalLabel}
            </Badge>
          </div>
        )}

        <div>
          <span className='text-tertiary-token'>Platform: </span>
          <Badge size='sm' variant='secondary'>
            {platformLabel}
          </Badge>
        </div>

        {entry.primarySocialUrlNormalized && (
          <a
            href={entry.primarySocialUrlNormalized}
            target='_blank'
            rel='noopener noreferrer'
            className='block truncate text-(--linear-accent) hover:underline'
          >
            {entry.primarySocialUrlNormalized.replace(/^https?:\/\//, '')}
          </a>
        )}

        {entry.spotifyUrlNormalized && (
          <div>
            <span className='text-tertiary-token'>Spotify: </span>
            <a
              href={entry.spotifyUrlNormalized}
              target='_blank'
              rel='noopener noreferrer'
              className='text-(--linear-accent) hover:underline'
            >
              Profile
            </a>
          </div>
        )}

        <div className='text-tertiary-token'>
          <DateCell
            date={entry.createdAt}
            formatOptions={{
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }}
          />
        </div>
      </div>

      {onApprove && (
        <div className='mt-2.5 border-t border-subtle pt-2.5'>
          <Button
            size='sm'
            variant='primary'
            className='h-8 w-full text-xs'
            disabled={
              approveStatus === 'approving' || approveStatus === 'disapproving'
            }
            onClick={onApprove}
          >
            {(() => {
              if (approveStatus === 'approving') return 'Approving…';
              if (approveStatus === 'disapproving') return 'Disapproving…';
              return isApproved ? 'Disapprove' : 'Approve';
            })()}
          </Button>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
