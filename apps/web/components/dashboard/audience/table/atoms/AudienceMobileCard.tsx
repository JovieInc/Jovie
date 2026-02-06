'use client';

import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { AudienceTypeBadge } from './AudienceTypeBadge';

export interface AudienceMobileCardProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
  readonly isSelected?: boolean;
  readonly onTap: (member: AudienceMember) => void;
}

/**
 * AudienceMobileCard - Compact card view for audience members on mobile.
 *
 * Memoized to prevent unnecessary re-renders in the mobile list.
 * Each card shows key info and taps to open the member detail sidebar.
 */
export const AudienceMobileCard = React.memo(function AudienceMobileCard({
  member,
  mode,
  isSelected,
  onTap,
}: AudienceMobileCardProps) {
  const displayName = member.displayName || 'Visitor';

  let secondaryLabel: string | null = null;
  if (member.type === 'email') {
    secondaryLabel = member.email;
  } else if (member.type === 'sms') {
    secondaryLabel = member.phone;
  }

  return (
    <button
      type='button'
      className={cn(
        'w-full text-left bg-surface-0 border border-subtle rounded-xl p-4 transition-colors',
        isSelected
          ? 'bg-surface-2/70 border-accent/40'
          : 'active:bg-surface-2/50'
      )}
      onClick={() => onTap(member)}
      aria-label={`View details for ${displayName}`}
    >
      {/* Header: Name + Type badge */}
      <div className='flex items-start justify-between gap-3'>
        <div className='flex-1 min-w-0'>
          <TruncatedText
            lines={1}
            className='font-medium text-sm text-primary-token'
          >
            {displayName}
          </TruncatedText>
          {secondaryLabel && (
            <TruncatedText
              lines={1}
              className='text-xs text-secondary-token mt-0.5'
            >
              {secondaryLabel}
            </TruncatedText>
          )}
        </div>
        <AudienceTypeBadge type={member.type} className='flex-shrink-0' />
      </div>

      {mode === 'members' ? (
        <MemberMetadata member={member} />
      ) : (
        <SubscriberMetadata member={member} />
      )}
    </button>
  );
});

/** Compact metadata row for members mode */
function MemberMetadata({ member }: { readonly member: AudienceMember }) {
  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-secondary-token'>
      {/* Location */}
      {member.locationLabel && (
        <span className='inline-flex items-center gap-1'>
          <Icon
            name='MapPin'
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
          <TruncatedText lines={1} className='max-w-[120px]'>
            {member.locationLabel}
          </TruncatedText>
        </span>
      )}

      {/* Visits + Intent */}
      <span className='inline-flex items-center gap-1'>
        <Icon
          name='Eye'
          className='h-3 w-3 text-tertiary-token'
          aria-hidden='true'
        />
        <span className='font-medium'>{member.visits}</span>
        <AudienceIntentBadge intentLevel={member.intentLevel} />
      </span>

      {/* Last Seen */}
      {member.lastSeenAt && (
        <span className='inline-flex items-center gap-1'>
          <Icon
            name='Clock'
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
          {formatTimeAgo(member.lastSeenAt)}
        </span>
      )}
    </div>
  );
}

/** Compact metadata row for subscribers mode */
function SubscriberMetadata({ member }: { readonly member: AudienceMember }) {
  return (
    <div className='flex items-center gap-x-4 mt-3 text-xs text-secondary-token'>
      {member.email && (
        <span className='inline-flex items-center gap-1 min-w-0'>
          <Icon
            name='Mail'
            className='h-3 w-3 text-tertiary-token flex-shrink-0'
            aria-hidden='true'
          />
          <TruncatedText lines={1}>{member.email}</TruncatedText>
        </span>
      )}
      {member.lastSeenAt && (
        <span className='inline-flex items-center gap-1 flex-shrink-0'>
          <Icon
            name='Calendar'
            className='h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
          {formatTimeAgo(member.lastSeenAt)}
        </span>
      )}
    </div>
  );
}
