'use client';

import { cn } from '@/lib/utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceTypeBadgeProps {
  readonly type: AudienceMemberType;
  readonly className?: string;
}

const TYPE_DOT_COLORS: Record<AudienceMemberType, string> = {
  anonymous: 'bg-tertiary-token/70',
  email: 'bg-accent',
  sms: 'bg-accent',
  spotify: 'bg-success',
  customer: 'bg-warning',
};

const TYPE_LABELS: Record<AudienceMemberType, string> = {
  anonymous: 'Anonymous',
  email: 'Email',
  sms: 'SMS',
  spotify: 'Spotify',
  customer: 'Customer',
};

export function AudienceTypeBadge({ type, className }: AudienceTypeBadgeProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', TYPE_DOT_COLORS[type])}
      />
      <span className='text-xs font-normal text-secondary-token'>
        {TYPE_LABELS[type]}
      </span>
    </div>
  );
}
