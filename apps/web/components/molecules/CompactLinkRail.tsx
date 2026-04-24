'use client';

import type { ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { PlatformPill } from '@/features/dashboard/atoms/PlatformPill';
import { cn } from '@/lib/utils';

export interface CompactLinkRailItem {
  readonly id: string;
  readonly platformIcon: string;
  readonly platformName: string;
  readonly primaryText: string;
  readonly onClick?: () => void;
  readonly summaryIcon?: ReactNode;
}

interface CompactLinkRailProps {
  readonly items: readonly CompactLinkRailItem[];
  readonly countLabel: string;
  readonly summaryCount?: number;
  readonly summaryAriaLabel?: string;
  readonly maxVisible?: number;
  readonly className?: string;
  readonly railClassName?: string;
}

export function CompactLinkRail({
  items,
  countLabel,
  summaryCount,
  summaryAriaLabel,
  maxVisible = 3,
  className,
  railClassName,
}: CompactLinkRailProps) {
  if (items.length === 0) return null;

  const visibleItems = items.slice(0, maxVisible);
  const summaryIcons = visibleItems.slice(0, 3);
  const displayCount = summaryCount ?? items.length;
  const useCollapsedPills = displayCount > 1;
  const showSummaryPill = useCollapsedPills;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-end gap-1 overflow-hidden',
        className
      )}
    >
      {showSummaryPill ? (
        <div
          className='inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-(--linear-app-frame-seam) bg-surface-1 px-1.5 text-[11px] font-caption tracking-[-0.01em] text-secondary-token'
          title={summaryAriaLabel ?? `${displayCount} ${countLabel}`}
        >
          <div className='flex -space-x-1 overflow-hidden pr-0.5'>
            {summaryIcons.map(item => (
              <span
                key={`summary-${item.id}`}
                className='flex h-4 w-4 items-center justify-center rounded-full border border-(--linear-bg-surface-0) bg-surface-0'
                aria-hidden='true'
              >
                {item.summaryIcon ?? (
                  <SocialIcon
                    platform={item.platformIcon}
                    className='h-2.5 w-2.5'
                  />
                )}
              </span>
            ))}
          </div>
          <span className='tabular-nums'>{displayCount}</span>
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-w-0 items-center gap-0.5 overflow-hidden',
          railClassName
        )}
      >
        {visibleItems.map(item => (
          <PlatformPill
            key={item.id}
            platformIcon={item.platformIcon}
            platformName={item.platformName}
            primaryText={item.primaryText}
            collapsed={useCollapsedPills}
            stackable={useCollapsedPills}
            onClick={item.onClick}
            className='min-w-0 max-w-full'
          />
        ))}
      </div>
    </div>
  );
}
