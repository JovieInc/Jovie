'use client';

import { AudienceIntentBadge } from '@/features/dashboard/atoms/AudienceIntentBadge';
import { cn } from '@/lib/utils';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceVisitsCellProps {
  readonly visits: number;
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

export function AudienceVisitsCell({
  visits,
  intentLevel,
  className,
}: AudienceVisitsCellProps) {
  return (
    <div className={cn('flex items-center gap-1.5 text-app', className)}>
      <span className='font-caption'>{visits}</span>
      <AudienceIntentBadge intentLevel={intentLevel} />
    </div>
  );
}
