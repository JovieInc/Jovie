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
  entry: WaitlistEntryRow;
  approveStatus: 'idle' | 'loading' | 'success' | 'error';
  onApprove: () => void;
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
  const isApproving = approveStatus === 'loading';
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

  return (
    <div className='bg-surface-0 border border-subtle rounded-xl overflow-hidden'>
      {/* Main card content - always visible */}
      <div className='p-4'>
        {/* Header: Name, Status, Action */}
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-primary-token truncate text-base'>
              {entry.fullName}
            </h3>
            <a
              href={`mailto:${entry.email}`}
              className='text-sm text-secondary-token hover:text-accent flex items-center gap-1.5 mt-0.5'
            >
              <Mail className='h-3.5 w-3.5 flex-shrink-0' />
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
              <Target className='h-3 w-3 mr-1' />
              {primaryGoalLabel}
            </Badge>
          )}
          {formattedDate && (
            <span className='text-xs text-tertiary-token flex items-center gap-1'>
              <Calendar className='h-3 w-3' />
              {formattedDate}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className='flex items-center gap-2 mt-4'>
          <Button
            size='sm'
            variant='secondary'
            disabled={isApproved || isApproving}
            onClick={onApprove}
            className='flex-1'
          >
            {(() => {
              if (isApproved) return 'Approved';
              if (isApproving) return 'Approving…';
              return 'Approve';
            })()}
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
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className='border-t border-subtle bg-surface-1/50 px-4 py-3 space-y-3'>
          {/* Primary Social */}
          <div className='flex items-start gap-3'>
            <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
              Social
            </div>
            <a
              href={entry.primarySocialUrlNormalized}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm text-accent hover:underline flex items-center gap-1.5 min-w-0'
            >
              <span className='truncate'>
                {entry.primarySocialUrlNormalized.replace(/^https?:\/\//, '')}
              </span>
              <ExternalLink className='h-3.5 w-3.5 flex-shrink-0' />
            </a>
          </div>

          {/* Spotify */}
          {entry.spotifyUrlNormalized && (
            <div className='flex items-start gap-3'>
              <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium flex items-center gap-1'>
                <Music className='h-3 w-3' />
                Spotify
              </div>
              <a
                href={entry.spotifyUrlNormalized}
                target='_blank'
                rel='noopener noreferrer'
                className='text-sm text-accent hover:underline flex items-center gap-1.5 min-w-0'
              >
                <span className='truncate'>
                  {entry.spotifyUrlNormalized.replace(/^https?:\/\//, '')}
                </span>
                <ExternalLink className='h-3.5 w-3.5 flex-shrink-0' />
              </a>
            </div>
          )}

          {/* Follower Count */}
          {entry.primarySocialFollowerCount != null && (
            <div className='flex items-start gap-3'>
              <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                Followers
              </div>
              <span className='text-sm text-secondary-token'>
                {entry.primarySocialFollowerCount.toLocaleString()}
              </span>
            </div>
          )}

          {/* Heard About */}
          {entry.heardAbout && (
            <div className='flex items-start gap-3'>
              <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium flex items-center gap-1'>
                <MessageSquare className='h-3 w-3' />
                Source
              </div>
              <span className='text-sm text-secondary-token'>
                {entry.heardAbout}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
