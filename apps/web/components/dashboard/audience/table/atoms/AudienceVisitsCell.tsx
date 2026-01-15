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
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className='font-semibold'>{visits}</span>
      <AudienceIntentBadge intentLevel={intentLevel} />
    </div>
  );
}
