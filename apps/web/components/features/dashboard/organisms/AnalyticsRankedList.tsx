'use client';

// @coverage-via apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx

import type { ComponentType } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export interface AnalyticsRankedItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

const RANKED_SKELETON_KEYS = [1, 2, 3, 4, 5] as const;

export function formatRankedLabel(label: string): string {
  try {
    return decodeURIComponent(label);
  } catch {
    return label;
  }
}

/**
 * Top-five ranked list for the analytics rail tabs (cities, countries,
 * sources, links). Loading, empty and loaded states share min-h-49 so the
 * tabbed card never changes height when data arrives.
 */
export function AnalyticsRankedList({
  icon: IconComponent,
  items,
  loading,
  emptyMessage,
}: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly items: readonly AnalyticsRankedItem[];
  readonly loading: boolean;
  readonly emptyMessage: string;
}) {
  if (loading) {
    return (
      <ul className='min-h-49 space-y-1'>
        {RANKED_SKELETON_KEYS.map(i => (
          <li
            key={i}
            className='flex h-8 items-center justify-between rounded-lg px-2.5'
          >
            <div className='flex items-center gap-2'>
              <LoadingSkeleton height='h-3' width='w-3' rounded='sm' />
              <LoadingSkeleton height='h-3' width='w-32' rounded='sm' />
            </div>
            <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className='flex min-h-49 flex-col items-center justify-center text-center'>
        <IconComponent className='mb-1.5 h-4 w-4 text-quaternary-token' />
        <p className='text-xs text-tertiary-token'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className='min-h-49 space-y-0.5'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='group flex h-8 items-center justify-between rounded-lg px-2.5 transition-colors hover:bg-surface-1'
        >
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <span className='w-3 text-2xs font-caption text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='truncate text-app text-secondary-token transition-colors group-hover:text-primary-token'>
              {formatRankedLabel(item.label)}
            </span>
          </div>
          <span className='ml-2 text-app font-semibold text-primary-token tabular-nums'>
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
