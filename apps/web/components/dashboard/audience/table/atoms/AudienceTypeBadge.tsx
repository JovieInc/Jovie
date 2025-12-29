'use client';

import { cn } from '@/lib/utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceTypeBadgeProps {
  type: AudienceMemberType;
  className?: string;
}

export function AudienceTypeBadge({ type, className }: AudienceTypeBadgeProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-sm text-primary-token sm:px-6',
        className
      )}
    >
      <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/40 px-2 py-0.5 text-[11px] font-medium text-secondary-token capitalize'>
        {type}
      </span>
    </td>
  );
}
