'use client';

import { memo, useCallback } from 'react';
import { FilterChip } from '@/components/molecules/filters';
import { cn } from '@/lib/utils';

export type ClusterChip = {
  readonly slug: string;
  readonly displayName: string;
};

interface ClusterFilterChipsProps {
  readonly clusters: readonly ClusterChip[];
  readonly selectedSlugs: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly className?: string;
}

function ClusterFilterChipsInner({
  clusters,
  selectedSlugs,
  onChange,
  className,
}: ClusterFilterChipsProps) {
  const toggle = useCallback(
    (slug: string) => {
      const set = new Set(selectedSlugs);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      onChange(Array.from(set));
    },
    [selectedSlugs, onChange]
  );

  const clearAll = useCallback(() => onChange([]), [onChange]);

  if (clusters.length === 0) return null;

  const showingAll = selectedSlugs.length === 0;

  return (
    <div
      className={cn('flex flex-wrap gap-1.5 px-4 py-2', className)}
      data-testid='cluster-filter-chips'
    >
      <FilterChip pressed={showingAll} onClick={clearAll}>
        All
      </FilterChip>
      {clusters.map(c => (
        <FilterChip
          key={c.slug}
          pressed={selectedSlugs.includes(c.slug)}
          onClick={() => toggle(c.slug)}
          data-testid={`cluster-chip-${c.slug}`}
        >
          {c.displayName}
        </FilterChip>
      ))}
    </div>
  );
}

export const ClusterFilterChips = memo(ClusterFilterChipsInner);
