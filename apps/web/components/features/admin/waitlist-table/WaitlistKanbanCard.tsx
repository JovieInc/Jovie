'use client';

import { Badge, Button } from '@jovie/ui';
import { Mail } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DateCell } from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
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
        'bg-surface-0 p-3',
        'transition-[border-color,box-shadow,background-color] duration-150 hover:border-default hover:bg-surface-1',
        'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* Header: Name + Status */}
      <div className='flex items-start justify-between gap-2 mb-2'>
        <div className='flex-1 min-w-0'>
          <h4 className='truncate text-sm font-semibold text-primary-token'>
            {entry.fullName}
          </h4>
          <a
            href={`mailto:${entry.email}`}
            className='mt-0.5 flex items-center gap-1 text-xs text-secondary-token hover:text-primary-token'
          >
            <Mail className='h-3 w-3' />
            <span className='truncate'>{entry.email}</span>
          </a>
        </div>
        <Badge size='sm' variant={statusVariant}>
          {entry.status}
        </Badge>
      </div>

      {/* Details */}
      <div className='space-y-2 text-xs'>
        {/* Primary Goal */}
        {primaryGoalLabel && (
          <div>
            <span className='text-tertiary-token'>Goal: </span>
            <Badge size='sm' variant='secondary'>
              {primaryGoalLabel}
            </Badge>
          </div>
        )}

        {/* Primary Social */}
        <div>
          <span className='text-tertiary-token'>Platform: </span>
          <Badge size='sm' variant='secondary'>
            {platformLabel}
          </Badge>
        </div>

        {/* Social Link */}
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

        {/* Spotify */}
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

        {/* Created Date */}
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

      {/* Actions */}
      {onApprove && (
        <div className='mt-3 border-t border-subtle pt-3'>
          <Button
            size='sm'
            variant='primary'
            className='w-full'
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
