'use client';

import { memo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { getMonogramInitials, getMonogramTone } from './initials';

export interface AudienceFanCellProps {
  readonly member: AudienceMember;
}

/** Mask a phone number for display: keep last 4 digits, dot the rest. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  // Preserve leading "+" and country prefix if present.
  const prefix = phone.startsWith('+')
    ? `+${digits.slice(0, digits.length - 4 - 3) || '1'}`
    : '';
  return `${prefix} (${digits.slice(-10, -7) || '•••'}) ••• ${last4}`.trim();
}

function pickIdentityChip(member: AudienceMember): string | null {
  const emailVisible = member.emailVisibleToArtist !== false;
  if (emailVisible && member.email) return member.email;
  if (member.phone) return maskPhone(member.phone);
  return null;
}

export const AudienceFanCell = memo(function AudienceFanCell({
  member,
}: AudienceFanCellProps) {
  const name = member.displayName?.trim() ?? '';
  const isAnonymous = !name && !member.email && !member.phone;

  const displayName = name || (isAnonymous ? 'Anonymous Fan' : 'Visitor');
  const monogram = isAnonymous ? '◯' : getMonogramInitials(displayName);
  const tone = isAnonymous
    ? 'bg-surface-0 text-tertiary-token'
    : getMonogramTone(displayName);
  const chip = isAnonymous ? null : pickIdentityChip(member);

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
