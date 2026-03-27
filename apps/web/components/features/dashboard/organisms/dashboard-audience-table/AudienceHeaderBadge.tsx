'use client';

import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DRAWER_TABS_RAIL_CLASSNAME } from '@/components/molecules/drawer/DrawerTabs';
import {
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
  PageToolbarTabButton,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';
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
  icon: string;
}[] = [
  { value: 'all', icon: 'Users' },
  { value: 'identified', icon: 'User' },
  { value: 'anonymous', icon: 'EyeOff' },
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
    all: totalAudienceCount === null ? 'All' : `All (${totalAudienceCount})`,
    identified:
      subscriberCount === null
        ? 'Identified'
        : `Identified (${subscriberCount})`,
    anonymous:
      anonymousCount === null ? 'Anonymous' : `Anonymous (${anonymousCount})`,
  };

  return (
    <div className='scrollbar-hide min-w-0 overflow-x-auto pb-px'>
      <div
        className={cn(
          DRAWER_TABS_RAIL_CLASSNAME,
          'w-max min-w-full rounded-[10px] border border-subtle bg-surface-1 p-1'
        )}
      >
        {VIEW_OPTIONS.map(({ value, icon }) => (
          <PageToolbarTabButton
            key={value}
            active={view === value}
            onClick={() => onViewChange(value)}
            className={cn('whitespace-nowrap')}
            icon={
              <Icon
                name={icon}
                className={PAGE_TOOLBAR_ICON_CLASS}
                strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
              />
            }
            label={labels[value]}
          />
        ))}
      </div>
    </div>
  );
});
