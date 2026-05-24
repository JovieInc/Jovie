'use client';

import { memo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import {
  getAudienceDisplayName,
  getAudienceIdentityChip,
  isAudienceMemberAnonymous,
} from '../row-contract';
import { getMonogramInitials, getMonogramTone } from './initials';

export interface AudienceFanCellProps {
  readonly member: AudienceMember;
}

export const AudienceFanCell = memo(function AudienceFanCell({
  member,
}: AudienceFanCellProps) {
  const isAnonymous = isAudienceMemberAnonymous(member);
  const displayName = getAudienceDisplayName(member);
  const monogram = isAnonymous ? '◯' : getMonogramInitials(displayName);
  const tone = isAnonymous
    ? 'bg-surface-0 text-tertiary-token'
    : getMonogramTone(displayName);
  const chip = isAnonymous
    ? null
    : getAudienceIdentityChip(member, displayName);

  return (
    <div className='flex items-center gap-2.5 min-w-0'>
      <div
        role='img'
        aria-label={`${displayName} avatar`}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-2xs font-semibold tabular-nums',
          tone
        )}
      >
        <span aria-hidden='true'>{monogram}</span>
      </div>
      <div className='min-w-0 flex-1'>
        <TruncatedText
          lines={1}
          className='text-app font-medium text-primary-token leading-tight'
        >
          {displayName}
        </TruncatedText>
        {chip ? (
          <span className='block truncate text-2xs text-secondary-token leading-tight'>
            {chip}
          </span>
        ) : null}
      </div>
    </div>
  );
});
