'use client';

import { cn } from '@/lib/utils';
import { StatTile } from './StatTile';

export interface EntityRailStatValue {
  readonly label: string;
  readonly value?: string;
  readonly state?: 'value' | 'loading' | 'not-measured';
  /** Names the missing source; surfaced on the "Not measured" stat. */
  readonly notMeasuredSource?: string;
  readonly hint?: string;
}

export interface StatRowProps {
  /** Exactly 3 key stats, ordered — the entity table owns the order. */
  readonly stats: readonly EntityRailStatValue[];
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * StatRow — the key-stats row slot of the EntityRail template.
 * A flat 3-column row of StatTiles under the entity header; unmeasured
 * stats render "Not measured" (never blank, never an em dash) with a
 * tooltip naming the missing source.
 */
export function StatRow({
  stats,
  className,
  'data-testid': testId,
}: StatRowProps) {
  const tiles = stats.slice(0, 3);
  return (
    <div
      data-testid={testId ?? 'entity-rail-stat-row'}
      data-slot='entity-rail-stat-row'
      className={cn('grid grid-cols-3 gap-2', className)}
    >
      {tiles.map(stat => (
        <StatTile
          key={stat.label}
          label={stat.label}
          value={stat.value}
          state={stat.state}
          notMeasuredSource={stat.notMeasuredSource}
          hint={stat.hint}
        />
      ))}
    </div>
  );
}
