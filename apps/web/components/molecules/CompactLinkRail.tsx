'use client';

import type { ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
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
          className='inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-(--app-shell-frame-seam) bg-surface-1 px-1.5 text-2xs font-caption tracking-tight text-secondary-token'
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
          <button
            key={item.id}
            type='button'
            onClick={item.onClick}
            title={item.platformName}
            className={cn(
              'inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-full border border-(--app-shell-frame-seam) bg-surface-1 px-1.5 text-2xs font-caption tracking-tight text-secondary-token',
              item.onClick && 'hover:bg-surface-0'
            )}
          >
            <SocialIcon
              platform={item.platformIcon}
              className='h-3 w-3 shrink-0'
            />
            {useCollapsedPills ? null : (
              <span className='min-w-0 truncate'>{item.primaryText}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
