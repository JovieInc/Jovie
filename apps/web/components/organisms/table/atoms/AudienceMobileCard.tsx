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
import { deriveAudienceState } from '@/lib/audience/derive-state';
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

const STATE_PILL = {
  high: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
  rising: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',
  dormant: 'bg-zinc-700/40 text-tertiary-token ring-zinc-700/50',
  subscriber: 'bg-violet-500/15 text-violet-200 ring-violet-500/25',
} as const;

const STATE_LABEL = {
  high: 'High',
  rising: 'Rising',
  dormant: 'Dormant',
  subscriber: 'Subscriber',
} as const;

/**
 * Compact mobile card matching the redesigned audience row.
 * Top row: monogram + name + state pill.
 * Bottom row: last-seen + Message action.
 *
 * The card outer is a non-button div (role=button) so the inner Message
 * action button is a valid HTML descendant. Tap behaviour is preserved
 * through the onClick + keyboard handler.
 */
export const AudienceMobileCard = React.memo(function AudienceMobileCard({
  member,
  mode,
  isSelected,
  onTap,
  onAction,
}: AudienceMobileCardProps) {
  const nowMs = useNowMs();
  const name = member.displayName?.trim() ?? '';
  const isAnonymous =
    !name && !member.email && !member.phone && !member.spotifyConnected;
  const displayName =
    name ||
    (isAnonymous
      ? 'Anonymous Fan'
      : member.type === 'email'
        ? 'Email Subscriber'
        : member.type === 'sms'
          ? 'SMS Subscriber'
          : 'Visitor');
  const monogram = isAnonymous ? '◯' : getMonogramInitials(displayName);
  const tone = isAnonymous
    ? 'bg-surface-0 text-tertiary-token'
    : getMonogramTone(displayName);

  // Use the SSR-safe nowMs context so the mobile card matches the desktop
  // table's hydration behaviour. While SSR_NOW_MS is in effect, every row
  // shows "Rising" until the post-mount tick swaps in the real clock.
  const state: keyof typeof STATE_PILL =
    mode === 'subscribers'
      ? 'subscriber'
      : isSsrNowMs(nowMs)
        ? 'rising'
        : deriveAudienceState(member, nowMs);

  const reachable = Boolean(member.email || member.phone);

  const handleCardClick = useCallback(() => onTap(member), [member, onTap]);
  const handleCardKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onTap(member);
      }
    },
    [member, onTap]
  );

  const handleActionClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!reachable) return;
      onAction?.(member);
    },
    [member, onAction, reachable]
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: card nests an action <button> for "Message"; using a real <button> wrapper would be invalid HTML.
    <div
      role='button'
      tabIndex={0}
      className={cn(
        'flex w-full items-stretch gap-3 px-4 py-3 text-left transition-[background-color,color] duration-150 outline-none',
        isSelected ? 'bg-surface-0' : 'active:bg-surface-0',
        'focus-visible:bg-surface-0 focus-visible:ring-1 focus-visible:ring-(--linear-app-shell-border)'
      )}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      aria-label={`View details for ${displayName}`}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums self-center',
          tone
        )}
        aria-hidden='true'
      >
        <span>{monogram}</span>
      </div>

      <div className='flex-1 min-w-0 flex flex-col justify-center gap-1'>
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
              STATE_PILL[state]
            )}
          >
            {STATE_LABEL[state]}
          </span>
        </div>

        <div className='flex items-center justify-between gap-2'>
          <span className='text-2xs text-tertiary-token tabular-nums'>
            {member.lastSeenAt ? formatTimeAgo(member.lastSeenAt) : '—'}
          </span>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={handleActionClick}
            disabled={!reachable}
            aria-label={`Message ${displayName}`}
            className='min-h-[44px] min-w-[88px] px-3 text-xs'
          >
            Message
          </Button>
        </div>
      </div>

      <Icon
        name='ChevronRight'
        className='size-4 text-quaternary-token self-center shrink-0'
        aria-hidden='true'
      />
    </div>
  );
});
