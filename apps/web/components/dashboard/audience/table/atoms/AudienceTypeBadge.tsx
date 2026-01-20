'use client';

import { cn } from '@/lib/utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceTypeBadgeProps {
  type: AudienceMemberType;
  className?: string;
}

export function AudienceTypeBadge({ type, className }: AudienceTypeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-subtle bg-surface-2/40 px-2.5 py-0.5 text-[11px] font-medium text-secondary-token capitalize',
        className
      )}
    >
      {type}
    </span>
  );
}
