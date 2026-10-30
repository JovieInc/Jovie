'use client';

import { cn } from '@/lib/utils';
import { StatTile, type StatTileProps } from './StatTile';

export type EntityRailStatValue = Pick<
  StatTileProps,
  'label' | 'value' | 'state' | 'notMeasuredSource' | 'hint'
>;

export interface StatRowProps {
  readonly stats: readonly EntityRailStatValue[];
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/** Exactly three stat slots in a flat row. */
export function StatRow({
  stats,
  className,
  'data-testid': testId,
}: StatRowProps) {
  return (
    <div
      data-testid={testId ?? 'entity-rail-stat-row'}
      data-slot='entity-rail-stat-row'
      className={cn('grid grid-cols-3 gap-2', className)}
    >
      {stats.slice(0, 3).map(stat => (
        <StatTile key={stat.label} {...stat} />
      ))}
    </div>
  );
}
