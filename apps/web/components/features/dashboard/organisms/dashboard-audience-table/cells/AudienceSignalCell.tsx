'use client';

import { memo } from 'react';
import { Tooltip } from '@/components/shell/Tooltip';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';

export interface AudienceSignalCellProps {
  readonly member: AudienceMember;
}

type ChannelStatus = 'verified' | 'pending' | 'missing';

function deriveSmsStatus(member: AudienceMember): ChannelStatus {
  if (member.phone) return 'verified';
  return 'missing';
}

function deriveEmailStatus(member: AudienceMember): ChannelStatus {
  if (!member.email || member.emailVisibleToArtist === false) {
    return 'missing';
  }
  if (member.artistEmailPendingProvider) return 'pending';
  if (member.artistEmailOptedIn === false) return 'missing';
  return 'verified';
}

const STATUS_LABEL: Record<ChannelStatus, string> = {
  verified: 'verified',
  pending: 'pending',
  missing: 'missing',
};

interface ChannelDotProps {
  readonly status: ChannelStatus;
  readonly label: string;
}

function ChannelDot({ status, label }: ChannelDotProps) {
  const tooltip = `${label} ${STATUS_LABEL[status]}`;
  return (
    <Tooltip label={tooltip} side='top'>
      <span
        className={cn(
          'inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold tabular-nums uppercase tracking-tight',
          status === 'verified' &&
            'bg-emerald-500/25 text-emerald-200 ring-1 ring-inset ring-emerald-500/40',
          status === 'pending' &&
            'border border-amber-500/60 text-amber-300/80',
          status === 'missing' &&
            'border border-zinc-700/60 text-tertiary-token'
        )}
        aria-label={tooltip}
        role='img'
      >
        {label === 'SMS' ? 'S' : 'E'}
      </span>
    </Tooltip>
  );
}

export const AudienceSignalCell = memo(function AudienceSignalCell({
  member,
}: AudienceSignalCellProps) {
  const sms = deriveSmsStatus(member);
  const email = deriveEmailStatus(member);
  return (
    <div className='flex items-center gap-1'>
      <ChannelDot status={sms} label='SMS' />
      <ChannelDot status={email} label='Email' />
    </div>
  );
});
