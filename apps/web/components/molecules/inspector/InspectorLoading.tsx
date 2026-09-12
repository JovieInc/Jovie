'use client';

import { Skeleton } from '@jovie/ui';
import type { CSSProperties } from 'react';

export interface InspectorLoadingProps {
  readonly rows?: number;
}

/** Optical 96px label column matches the Library System B metadata grid. */
const LOADING_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: '96px minmax(0, 1fr)',
};

export function InspectorLoading({ rows = 4 }: InspectorLoadingProps) {
  const rowIds = Array.from(
    { length: rows },
    (_, index) => `inspector-loading-row-${index + 1}`
  );

  return (
    <div
      data-testid='inspector-loading'
      className='space-y-2 px-3 py-2.5'
      aria-busy='true'
      aria-live='polite'
    >
      <span className='sr-only'>Loading inspector</span>
      {rowIds.map(rowId => (
        <div
          key={rowId}
          className='grid items-center gap-2'
          style={LOADING_GRID_STYLE}
        >
          <Skeleton className='h-2.5 w-12' />
          <Skeleton className='h-3.5 w-full' />
        </div>
      ))}
    </div>
  );
}
