'use client';

import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceVisitsCellProps {
  visits: number;
  intentLevel: AudienceIntentLevel;
  className?: string;
}

export function AudienceVisitsCell({
  visits,
  intentLevel,
  className,
}: AudienceVisitsCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-sm text-primary-token sm:px-6',
        className
      )}
    >
      <div className='flex items-center gap-2'>
        <span className='font-semibold'>{visits}</span>
        <AudienceIntentBadge intentLevel={intentLevel} />
      </div>
    </td>
  );
}
