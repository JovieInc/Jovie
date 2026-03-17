'use client';

import { Badge, Button } from '@jovie/ui';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  MessageSquare,
  Music,
  Target,
} from 'lucide-react';
import React, { useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';

/** Map platform ID to display name */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  twitch: 'Twitch',
  linktree: 'Linktree',
  facebook: 'Facebook',
  threads: 'Threads',
  snapchat: 'Snapchat',
  unknown: 'Unknown',
};

const PRIMARY_GOAL_LABELS: Record<string, string> = {
  streams: 'Streams',
  merch: 'Merch',
  tickets: 'Tickets',
};

/** Map status to badge variant */
const STATUS_VARIANTS: Record<
  string,
  'primary' | 'secondary' | 'success' | 'error' | 'warning'
> = {
  new: 'secondary',
  invited: 'primary',
  claimed: 'success',
  rejected: 'error',
};

export interface WaitlistMobileCardProps {
  readonly entry: WaitlistEntryRow;
  readonly approveStatus:
    | 'idle'
    | 'approving'
    | 'disapproving'
    | 'success'
    | 'error';
  readonly onApprove: () => void;
}

/**
 * WaitlistMobileCard - Mobile card view for waitlist entries
 *
 * Memoized to prevent unnecessary re-renders when list items change.
 * In list contexts, this prevents all cards from re-rendering when
 * one card's approveStatus changes or expands.
 */
export const WaitlistMobileCard = React.memo(function WaitlistMobileCard({
  entry,
  approveStatus,
  onApprove,
}: WaitlistMobileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isApproved = entry.status === 'invited' || entry.status === 'claimed';
  const isApproving = approveStatus === 'approving';
  const isDisapproving = approveStatus === 'disapproving';
  const statusVariant = STATUS_VARIANTS[entry.status] ?? 'secondary';
  const platformLabel =
    PLATFORM_LABELS[entry.primarySocialPlatform] ?? entry.primarySocialPlatform;
  const primaryGoalLabel = entry.primaryGoal
    ? (PRIMARY_GOAL_LABELS[entry.primaryGoal] ?? entry.primaryGoal)
    : null;

  const formattedDate = entry.createdAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(entry.createdAt)
    : null;

  // Determine button label based on approval state
  const getApproveButtonLabel = (): string => {
    if (isApproving) return 'Approving…';
    if (isDisapproving) return 'Disapproving…';
    if (isApproved) return 'Disapprove';
    return 'Approve';
  };
  const approveButtonLabel = getApproveButtonLabel();

  return (
    <ContentSurfaceCard className='overflow-hidden bg-surface-0 p-0'>
      {/* Main card content - always visible */}
      <div className='p-4'>
        {/* Header: Name, Status, Action */}
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <h3 className='truncate text-base font-semibold text-primary-token'>
              {entry.fullName}
            </h3>
            <a
              href={`mailto:${entry.email}`}
              className='mt-0.5 flex items-center gap-1.5 text-sm text-secondary-token hover:text-primary-token'
            >
              <Mail className='h-3.5 w-3.5 flex-shrink-0' aria-hidden />
              <span className='truncate'>{entry.email}</span>
            </a>
          </div>
          <Badge size='sm' variant={statusVariant} className='flex-shrink-0'>
            {entry.status}
          </Badge>
        </div>

        {/* Quick info row */}
        <div className='flex flex-wrap items-center gap-2 mt-3'>
          <Badge size='sm' variant='secondary'>
            {platformLabel}
          </Badge>
          {primaryGoalLabel && (
            <Badge size='sm' variant='secondary'>
              <Target className='mr-1 h-3 w-3' aria-hidden />
              {primaryGoalLabel}
            </Badge>
          )}
          {formattedDate && (
            <span className='flex items-center gap-1 text-xs text-tertiary-token'>
              <Calendar className='h-3 w-3' aria-hidden />
              {formattedDate}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className='flex items-center gap-2 mt-4'>
          <Button
            size='sm'
            variant='secondary'
            disabled={isApproving || isDisapproving}
            onClick={onApprove}
            className='flex-1'
          >
            {approveButtonLabel}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setIsExpanded(!isExpanded)}
            className='flex-shrink-0 px-3'
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Show less details' : 'Show more details'}
          >
            {isExpanded ? (
              <ChevronUp className='h-3.5 w-3.5' />
            ) : (
              <ChevronDown className='h-3.5 w-3.5' />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className='space-y-3 border-t border-subtle bg-surface-0 px-4 py-3'>
          {/* Primary Social */}
          <div className='flex items-start gap-3'>
            <div className='w-20 flex-shrink-0 text-xs font-medium text-tertiary-token'>
              Social
            </div>
            <a
              href={entry.primarySocialUrlNormalized}
              target='_blank'
              rel='noopener noreferrer'
              className='flex min-w-0 items-center gap-1.5 text-sm text-(--linear-accent) hover:underline'
            >
              <span className='truncate'>
                {entry.primarySocialUrlNormalized.replace(/^https?:\/\//, '')}
              </span>
              <ExternalLink className='h-3.5 w-3.5 flex-shrink-0' aria-hidden />
            </a>
          </div>

          {/* Spotify */}
          {entry.spotifyUrlNormalized && (
            <div className='flex items-start gap-3'>
              <div className='flex w-20 flex-shrink-0 items-center gap-1 text-xs font-medium text-tertiary-token'>
                <Music className='h-3 w-3' aria-hidden />
                Spotify
              </div>
              <a
                href={entry.spotifyUrlNormalized}
                target='_blank'
                rel='noopener noreferrer'
                className='flex min-w-0 items-center gap-1.5 text-sm text-(--linear-accent) hover:underline'
              >
                <span className='truncate'>
                  {entry.spotifyUrlNormalized.replace(/^https?:\/\//, '')}
                </span>
                <ExternalLink
                  className='h-3.5 w-3.5 flex-shrink-0'
                  aria-hidden
                />
              </a>
            </div>
          )}

          {/* Follower Count */}
          {entry.primarySocialFollowerCount != null && (
            <div className='flex items-start gap-3'>
              <div className='w-20 flex-shrink-0 text-xs font-medium text-tertiary-token'>
                Followers
              </div>
              <span className='text-sm text-secondary-token tabular-nums'>
                {entry.primarySocialFollowerCount.toLocaleString()}
              </span>
            </div>
          )}

          {/* Heard About */}
          {entry.heardAbout && (
            <div className='flex items-start gap-3'>
              <div className='flex w-20 flex-shrink-0 items-center gap-1 text-xs font-medium text-tertiary-token'>
                <MessageSquare className='h-3 w-3' aria-hidden />
                Source
              </div>
              <span className='text-sm text-secondary-token'>
                {entry.heardAbout}
              </span>
            </div>
          )}
        </div>
      )}
    </ContentSurfaceCard>
  );
});
