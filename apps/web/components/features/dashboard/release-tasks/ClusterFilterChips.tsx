'use client';

import { memo, useCallback } from 'react';
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
      <button
        type='button'
        onClick={clearAll}
        aria-pressed={showingAll}
        className={cn(
          'px-2.5 py-1 rounded-full text-xs border transition-colors',
          showingAll
            ? 'bg-foreground text-background border-foreground'
            : 'bg-transparent text-muted-foreground border-border hover:border-foreground/60'
        )}
      >
        All
      </button>
      {clusters.map(c => {
        const selected = selectedSlugs.includes(c.slug);
        return (
          <button
            key={c.slug}
            type='button'
            onClick={() => toggle(c.slug)}
            aria-pressed={selected}
            data-testid={`cluster-chip-${c.slug}`}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs border transition-colors',
              selected
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/60'
            )}
          >
            {c.displayName}
          </button>
        );
      })}
    </div>
  );
}

export const ClusterFilterChips = memo(ClusterFilterChipsInner);
