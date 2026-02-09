'use client';

import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceIntentLevel, AudienceMember } from '@/types';

export interface AudienceMobileCardProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
  readonly isSelected?: boolean;
  readonly onTap: (member: AudienceMember) => void;
}

const INTENT_STYLES: Record<AudienceIntentLevel, string> = {
  high: 'text-primary-token',
  medium: 'text-secondary-token',
  low: 'text-tertiary-token',
};

/**
 * AudienceMobileCard - Clean, Apple-esque card for audience members on mobile.
 *
 * Uses avatar anchoring, clear typographic hierarchy, and inline metadata.
 * Memoized to prevent unnecessary re-renders in the mobile list.
 */
export const AudienceMobileCard = React.memo(function AudienceMobileCard({
  member,
  mode,
  isSelected,
  onTap,
}: AudienceMobileCardProps) {
  const displayName = member.displayName || 'Visitor';

  return (
    <button
      type='button'
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors duration-150',
        isSelected
          ? 'bg-surface-2/70'
          : 'active:bg-surface-2/40'
      )}
      onClick={() => onTap(member)}
      aria-label={`View details for ${displayName}`}
    >
      {/* Avatar circle */}
      <div
        className='flex-shrink-0 size-9 rounded-full bg-surface-2 flex items-center justify-center mt-0.5'
        aria-hidden='true'
      >
        <Icon
          name='User'
          className='size-4 text-tertiary-token'
        />
      </div>

      {/* Content */}
      <div className='flex-1 min-w-0'>
        {/* Row 1: Name + Time */}
        <div className='flex items-baseline justify-between gap-2'>
          <TruncatedText
            lines={1}
            className='font-semibold text-[15px] leading-tight text-primary-token'
          >
            {displayName}
          </TruncatedText>
          {mode === 'members' && member.lastSeenAt && (
            <span className='flex-shrink-0 text-xs text-tertiary-token tabular-nums'>
              {formatTimeAgo(member.lastSeenAt)}
            </span>
          )}
        </div>

        {mode === 'members' ? (
          <MemberDetails member={member} />
        ) : (
          <SubscriberDetails member={member} />
        )}
      </div>

      {/* Chevron */}
      <div className='flex-shrink-0 self-center'>
        <Icon
          name='ChevronRight'
          className='size-4 text-quaternary-token'
          aria-hidden='true'
        />
      </div>
    </button>
  );
});

/** Subtitle lines for members mode */
function MemberDetails({ member }: { readonly member: AudienceMember }) {
  return (
    <div className='mt-0.5 space-y-0.5'>
      {/* Location */}
      {member.locationLabel && (
        <p className='text-[13px] leading-snug text-secondary-token truncate'>
          {member.locationLabel}
        </p>
      )}

      {/* Inline metadata: type · visits · intent */}
      <p className='text-xs text-tertiary-token flex items-center gap-1'>
        <span className='capitalize'>{member.type}</span>
        <Separator />
        <span className='tabular-nums'>
          {member.visits} {member.visits === 1 ? 'visit' : 'visits'}
        </span>
        <Separator />
        <span className={cn('font-medium', INTENT_STYLES[member.intentLevel])}>
          {member.intentLevel.charAt(0).toUpperCase() +
            member.intentLevel.slice(1)}
        </span>
      </p>
    </div>
  );
}

/** Subtitle lines for subscribers mode */
function SubscriberDetails({ member }: { readonly member: AudienceMember }) {
  return (
    <div className='mt-0.5 space-y-0.5'>
      {member.email && (
        <p className='text-[13px] leading-snug text-secondary-token truncate'>
          {member.email}
        </p>
      )}
      {member.lastSeenAt && (
        <p className='text-xs text-tertiary-token'>
          Subscribed {formatTimeAgo(member.lastSeenAt)}
        </p>
      )}
    </div>
  );
}

/** Tiny dot separator for inline metadata */
function Separator() {
  return (
    <span className='text-quaternary-token select-none' aria-hidden='true'>
      ·
    </span>
  );
}
