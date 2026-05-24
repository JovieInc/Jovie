'use client';

import { Button } from '@jovie/ui';
import React, { useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  getMonogramInitials,
  getMonogramTone,
} from '@/components/features/dashboard/organisms/dashboard-audience-table/cells/initials';
import {
  isSsrNowMs,
  useNowMs,
} from '@/components/features/dashboard/organisms/dashboard-audience-table/cells/NowMsContext';
import {
  AUDIENCE_STATE_LABELS,
  AUDIENCE_STATE_STYLES,
  getAudienceDisplayName,
  getAudienceDisplayState,
  isAudienceMemberAnonymous,
  isAudienceMemberReachable,
} from '@/components/features/dashboard/organisms/dashboard-audience-table/row-contract';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

export interface AudienceMobileCardProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
  readonly isSelected?: boolean;
  readonly onTap: (member: AudienceMember) => void;
  readonly onAction?: (member: AudienceMember) => void;
}

/**
 * Compact mobile card matching the redesigned audience row.
 * Top row: monogram + name + state pill.
 * Bottom row: last-seen + Message action.
 *
 * The card uses two sibling buttons: a "stretched" tap target absolutely
 * positioned behind the content for the row click, and the Message button
 * in front for the primary action. This keeps both controls semantic and
 * un-nested without resorting to a `role='button'` div.
 */
export const AudienceMobileCard = React.memo(function AudienceMobileCard({
  member,
  mode,
  isSelected,
  onTap,
  onAction,
}: AudienceMobileCardProps) {
  const nowMs = useNowMs();
  const isAnonymous = isAudienceMemberAnonymous(member);
  const displayName = getAudienceDisplayName(member);
  const monogram = isAnonymous ? '◯' : getMonogramInitials(displayName);
  const tone = isAnonymous
    ? 'bg-surface-0 text-tertiary-token'
    : getMonogramTone(displayName);

  // Use the SSR-safe nowMs context so the mobile card matches the desktop
  // table's hydration behaviour. While SSR_NOW_MS is in effect, every row
  // shows "Rising" until the post-mount tick swaps in the real clock.
  const isSsr = isSsrNowMs(nowMs);
  const state = getAudienceDisplayState({
    member,
    mode,
    nowMs,
    isSsr,
  });
  const reachable = isAudienceMemberReachable(member);

  const handleCardClick = useCallback(() => onTap(member), [member, onTap]);

  const handleActionClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!reachable) return;
      onAction?.(member);
    },
    [member, onAction, reachable]
  );

  return (
    <div
      className={cn(
        'relative flex w-full items-stretch gap-3 px-4 py-3 transition-[background-color,color] duration-subtle',
        isSelected ? 'bg-surface-0' : 'active:bg-surface-0'
      )}
    >
      {/* Stretched tap target — absolutely positioned behind the content so
          the Message button (which has z-10) intercepts clicks for itself. */}
      <button
        type='button'
        onClick={handleCardClick}
        aria-label={`View details for ${displayName}`}
        className='absolute inset-0 outline-none focus-visible:bg-surface-0 focus-visible:ring-1 focus-visible:ring-(--linear-app-shell-border)'
      />

      <div
        className={cn(
          'pointer-events-none relative z-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums self-center',
          tone
        )}
        aria-hidden='true'
      >
        <span>{monogram}</span>
      </div>

      <div className='pointer-events-none relative z-0 flex-1 min-w-0 flex flex-col justify-center gap-1'>
        <div className='flex items-center justify-between gap-2 min-w-0'>
          <TruncatedText
            lines={1}
            className='text-mid font-semibold leading-tight text-primary-token min-w-0'
          >
            {displayName}
          </TruncatedText>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-2xs font-medium tabular-nums ring-1 ring-inset',
              AUDIENCE_STATE_STYLES[state]
            )}
          >
            {AUDIENCE_STATE_LABELS[state]}
          </span>
        </div>

        <div className='flex items-center justify-between gap-2'>
          <span className='text-2xs text-tertiary-token tabular-nums'>
            {member.lastSeenAt && !isSsr
              ? formatTimeAgo(member.lastSeenAt)
              : '—'}
          </span>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={handleActionClick}
            disabled={!reachable}
            aria-label={`Message ${displayName}`}
            className='pointer-events-auto relative z-10 min-h-[44px] min-w-[88px] px-3 text-xs'
          >
            Message
          </Button>
        </div>
      </div>

      <Icon
        name='ChevronRight'
        className='pointer-events-none relative z-0 size-4 text-quaternary-token self-center shrink-0'
        aria-hidden='true'
      />
    </div>
  );
});
