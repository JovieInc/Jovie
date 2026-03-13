'use client';

import { Ghost, UserCheck, Users } from 'lucide-react';
import { memo } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import type { AudienceView } from './types';

interface AudienceHeaderBadgeProps {
  readonly view: AudienceView;
  readonly onViewChange: (view: AudienceView) => void;
  /** Null when the COUNT query was skipped for performance (JOV-1262). */
  readonly totalAudienceCount: number | null;
  /** Null when the COUNT query was skipped for performance (JOV-1262). */
  readonly subscriberCount: number | null;
}

const VIEW_OPTIONS: {
  value: AudienceView;
  Icon: typeof Users;
}[] = [
  { value: 'all', Icon: Users },
  { value: 'identified', Icon: UserCheck },
  { value: 'anonymous', Icon: Ghost },
];

export const AudienceHeaderBadge = memo(function AudienceHeaderBadge({
  view,
  onViewChange,
  totalAudienceCount,
  subscriberCount,
}: AudienceHeaderBadgeProps) {
  const anonymousCount =
    totalAudienceCount !== null && subscriberCount !== null
      ? Math.max(totalAudienceCount - subscriberCount, 0)
      : null;

  const labels: Record<AudienceView, string> = {
    all: totalAudienceCount !== null ? `All (${totalAudienceCount})` : 'All',
    identified:
      subscriberCount !== null
        ? `Identified (${subscriberCount})`
        : 'Identified',
    anonymous:
      anonymousCount !== null ? `Anonymous (${anonymousCount})` : 'Anonymous',
  };

  return (
    <div className='scrollbar-hide flex min-w-0 items-center overflow-x-auto'>
      <AppSegmentControl
        value={view}
        onValueChange={onViewChange}
        aria-label='Audience view filter'
        surface='ghost'
        className='backdrop-blur-sm'
        triggerClassName='whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 hover:bg-(--linear-bg-surface-1)'
        options={VIEW_OPTIONS.map(({ value, Icon }) => ({
          value,
          label: (
            <span className='inline-flex items-center gap-1.5'>
              <Icon className='h-3 w-3' />
              <span>{labels[value]}</span>
            </span>
          ),
        }))}
      />
    </div>
  );
});
