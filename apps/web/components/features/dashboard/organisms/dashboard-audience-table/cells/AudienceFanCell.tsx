'use client';

import { memo } from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { getMonogramInitials, getMonogramTone } from './initials';

export interface AudienceFanCellProps {
  readonly member: AudienceMember;
}

/**
 * Mask a phone number for display.
 *
 * Format: "+CC ••• LAST4" where CC is 1–3 country-code digits and LAST4 is
 * the last four digits. Anything we cannot confidently parse falls back to
 * the raw input rather than an awkward fabricated layout.
 */
function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return trimmed;
  const last4 = digits.slice(-4);
  const hasPlus = trimmed.startsWith('+');
  // Only emit a country code when the phone genuinely has digits beyond the
  // standard 10-digit national number. This avoids fabricating a "+5" prefix
  // for short test numbers like "+5551234".
  const ccLen = hasPlus ? Math.min(3, Math.max(0, digits.length - 10)) : 0;
  const cc = ccLen > 0 ? `+${digits.slice(0, ccLen)} ` : '';
  return `${cc}••• ${last4}`;
}

function pickIdentityChip(
  member: AudienceMember,
  displayName: string
): string | null {
  const emailVisible = member.emailVisibleToArtist !== false;
  if (emailVisible && member.email && member.email !== displayName) {
    return member.email;
  }
  if (member.phone) return maskPhone(member.phone);
  return null;
}

export const AudienceFanCell = memo(function AudienceFanCell({
  member,
}: AudienceFanCellProps) {
  const name = member.displayName?.trim() ?? '';
  // Treat email as absent when it's gated from the artist — otherwise we'd
  // render "Visitor" instead of "Anonymous Fan" and leak that a hidden
  // identity exists.
  const visibleEmail =
    member.emailVisibleToArtist === false ? null : member.email;
  // A fan is anonymous only when we have no contact channel AND no provider
  // identity. A Spotify-connected fan without email/phone is still identified.
  const isAnonymous =
    !name && !visibleEmail && !member.phone && !member.spotifyConnected;

  const displayName = name || (isAnonymous ? 'Anonymous Fan' : 'Visitor');
  const monogram = isAnonymous ? '◯' : getMonogramInitials(displayName);
  const tone = isAnonymous
    ? 'bg-surface-0 text-tertiary-token'
    : getMonogramTone(displayName);
  const chip = isAnonymous ? null : pickIdentityChip(member, displayName);

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
