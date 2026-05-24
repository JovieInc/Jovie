'use client';

import { Bell } from 'lucide-react';
import { memo } from 'react';
import { Tooltip } from '@/components/shell/Tooltip';
import { cn } from '@/lib/utils';
import type { AudienceAlertChannel, AudienceMember } from '@/types';

export interface AudienceAlertsCellProps {
  readonly member: AudienceMember;
}

const CHANNEL_LABEL: Record<AudienceAlertChannel, string> = {
  sms: 'SMS',
  email: 'Email',
  push: 'Web push',
};

const CHANNEL_LETTER: Record<AudienceAlertChannel, string> = {
  sms: 'S',
  email: 'E',
  push: 'W',
};

function ChannelChip({ channel }: { readonly channel: AudienceAlertChannel }) {
  const label = `${CHANNEL_LABEL[channel]} alerts active`;
  return (
    <Tooltip label={label} side='top'>
      <span
        className='inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500/20 text-[8px] font-bold tabular-nums uppercase tracking-tight text-emerald-200 ring-1 ring-inset ring-emerald-500/40'
        aria-label={label}
        role='img'
      >
        {CHANNEL_LETTER[channel]}
      </span>
    </Tooltip>
  );
}

/**
 * Renders the audience member's alert state, sourced from denormalized
 * columns on `audience_members` (JOV-1842). Hidden when no confirmed
 * subscriptions exist — phone/email presence alone no longer implies SMS/
 * email status.
 */
export const AudienceAlertsCell = memo(function AudienceAlertsCell({
  member,
}: AudienceAlertsCellProps) {
  const channels = member.activeAlertChannels ?? [];
  const isActive = Boolean(member.hasActiveAlerts) && channels.length > 0;

  if (!isActive) {
    return <span className='sr-only'>No alerts</span>;
  }

  const tooltip = `Alerts on: ${channels.map(c => CHANNEL_LABEL[c]).join(', ')}`;

  return (
    <output className='inline-flex items-center gap-1' aria-label={tooltip}>
      <Tooltip label={tooltip} side='top'>
        <Bell
          className={cn('h-3.5 w-3.5 text-emerald-300 fill-emerald-300/30')}
          strokeWidth={2}
          aria-hidden='true'
        />
      </Tooltip>
      {channels.map(channel => (
        <ChannelChip key={channel} channel={channel} />
      ))}
    </output>
  );
});
