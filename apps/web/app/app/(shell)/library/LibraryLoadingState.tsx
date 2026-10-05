'use client';

import { useMemo, useState } from 'react';
import { columnPrioritySpecsFromDefs } from '@/components/organisms/table/column-priority';
import { useColumnPriorityLayout } from '@/components/organisms/table/hooks/useColumnPriorityLayout';
import { PageToolbar } from '@/components/organisms/table/molecules/PageToolbar';
import { UnifiedTableSkeleton } from '@/components/organisms/table/organisms/UnifiedTableSkeleton';
import {
  alignment,
  type TableRowMode,
} from '@/components/organisms/table/table.styles';
import { WorkspacePage } from '@/components/organisms/WorkspacePage';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import { LIBRARY_LIFECYCLE_STAGES } from '@/lib/library/lifecycle-stage';
import type { ColumnDef } from '@/lib/tanstack-table';
import type { LibraryReleaseAsset } from './library-data';

/**
 * Work loading skeleton.
 *
 * The app shell layout renders this as the first-boot fallback for every
 * authed route, so it must not import `LibrarySurface`: that module is the
 * whole Library feature and would ship to every /app page. The columns carry
 * geometry only (id, header, size, minSize, className), which is all the
 * skeleton reads. `LibraryLoadingState.test.ts` pins them to the live table.
 */

/**
 * List rows carry two lines (title + artist), so they use the canonical
 * two-line row mode. A bare `rowHeight` sizes virtualization only; the 40px
 * row class and 32px cell clamp still apply, which clipped the artist line.
 */
export const LIBRARY_LIST_ROW_MODE = 'two-line' satisfies TableRowMode;
export const LIBRARY_CATALOG_ROW_MODE = 'dense' satisfies TableRowMode;
export const LIBRARY_TABLE_MIN_WIDTH = '0';

export const LIBRARY_STAGE_CHIP_KEYS = [
  'all',
  ...LIBRARY_LIFECYCLE_STAGES,
] as const;

export const LIBRARY_TABLE_SKELETON_CONFIG: Array<{
  readonly width?: string;
  readonly variant?:
    | 'text'
    | 'avatar'
    | 'badge'
    | 'button'
    | 'release'
    | 'meta';
}> = [
  { variant: 'release', width: '100%' },
  { variant: 'meta', width: '72px' },
  { variant: 'avatar', width: '16px' },
  { variant: 'text', width: '88px' },
  { variant: 'meta', width: '72px' },
  { variant: 'text', width: '96px' },
];

export const LIBRARY_TABLE_SKELETON_COLUMNS = [
  {
    id: 'release',
    header: 'Item',
    minSize: 220,
    size: 9999,
    meta: { className: alignment.workspaceSeamX, primary: true, minWidth: 220 },
  },
  {
    id: 'releaseDate',
    header: 'Release Date',
    size: 112,
    minSize: 96,
    meta: { className: 'pl-2 pr-3', priority: 5, minWidth: 112 },
  },
  {
    id: 'status',
    header: 'Status',
    size: 40,
    minSize: 40,
    meta: { className: 'px-2', minWidth: 40, headerVisibility: 'sr-only' },
  },
  {
    id: 'type',
    header: 'Type',
    size: 104,
    minSize: 88,
    meta: { className: 'px-2', priority: 2, minWidth: 104 },
  },
  {
    id: 'providers',
    header: 'Providers',
    size: 120,
    minSize: 96,
    meta: { className: 'px-2', priority: 3, minWidth: 120 },
  },
  {
    id: 'shareUrl',
    header: 'Share URL',
    size: 220,
    minSize: 180,
    meta: { className: 'px-2', priority: 1, minWidth: 220 },
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 40,
    minSize: 40,
    meta: {
      className: 'w-10 pl-1 pr-2',
      headerVisibility: 'sr-only',
      actionVisibility: 'contextual',
    },
  },
] as ColumnDef<LibraryReleaseAsset, unknown>[];

// Geometry only: importing the feature columns here would load the whole
// catalog graph into the shell fallback. The parity test pins this projection.
export const LIBRARY_CATALOG_SKELETON_COLUMNS = [
  {
    id: 'status',
    header: 'Status',
    size: 44,
    minSize: 44,
    meta: {
      className: alignment.workspaceSeamX,
      minWidth: 44,
      headerVisibility: 'sr-only',
    },
  },
  {
    id: 'artwork',
    header: 'Artwork',
    size: 40,
    minSize: 40,
    meta: { className: 'px-2', minWidth: 40, headerVisibility: 'sr-only' },
  },
  {
    id: 'title',
    header: 'Title',
    minSize: 180,
    size: 9999,
    meta: { className: 'px-2', primary: true, minWidth: 180 },
  },
  {
    id: 'artist',
    header: 'Artist',
    size: 160,
    minSize: 120,
    meta: { className: 'px-2', priority: 5, minWidth: 160 },
  },
  {
    id: 'type',
    header: 'Type',
    size: 120,
    minSize: 96,
    meta: { className: 'pl-2 pr-3', priority: 6, minWidth: 120 },
  },
  {
    id: 'length',
    header: 'Length',
    size: 80,
    minSize: 72,
    meta: { className: 'px-2', priority: 5, minWidth: 80 },
  },
  LIBRARY_TABLE_SKELETON_COLUMNS[6],
] as ColumnDef<LibraryReleaseAsset, unknown>[];

export const LIBRARY_CATALOG_SKELETON_CONFIG: typeof LIBRARY_TABLE_SKELETON_CONFIG =
  [
    { variant: 'text', width: '16px' },
    { variant: 'badge', width: '24px' },
    { variant: 'text', width: '100%' },
    { variant: 'text', width: '96px' },
    { variant: 'text', width: '72px' },
    { variant: 'text', width: '48px' },
    { variant: 'text', width: '24px' },
  ];

const CATALOG_PRIORITY_SPECS = columnPrioritySpecsFromDefs(
  LIBRARY_CATALOG_SKELETON_COLUMNS
);

export function LibraryLoadingState() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { hiddenIds } = useColumnPriorityLayout(
    CATALOG_PRIORITY_SPECS,
    container
  );
  // The shared skeleton body consumes every supplied column. Apply the same
  // fit policy to columns and placeholders so hidden headers have no body cell.
  const { columns, config } = useMemo(() => {
    const visibleIndexes = LIBRARY_CATALOG_SKELETON_COLUMNS.flatMap(
      (column, index) => (hiddenIds.includes(column.id ?? '') ? [] : [index])
    );
    return {
      columns: visibleIndexes.map(
        index => LIBRARY_CATALOG_SKELETON_COLUMNS[index]
      ),
      config: visibleIndexes.map(
        index => LIBRARY_CATALOG_SKELETON_CONFIG[index]
      ),
    };
  }, [hiddenIds]);
  return (
    <WorkspacePage
      aria-busy='true'
      aria-label='Loading Work'
      frame='content-container'
      contentPadding='none'
      surfaceMode='table'
      data-testid='library-surface-loading'
      toolbar={
        <PageToolbar
          start={
            <div
              className='flex min-w-0 flex-wrap items-center gap-1'
              data-testid='library-view-filter-chips'
            >
              {LIBRARY_STAGE_CHIP_KEYS.map(key => (
                <span
                  key={key}
                  className='inline-block h-8 w-16 rounded-full skeleton motion-reduce:animate-none'
                  aria-hidden='true'
                />
              ))}
            </div>
          }
        />
      }
    >
      <div ref={setContainer} className='h-full min-w-0'>
        <UnifiedTableSkeleton<LibraryReleaseAsset>
          columns={columns}
          rowMode={LIBRARY_CATALOG_ROW_MODE}
          minWidth={LIBRARY_TABLE_MIN_WIDTH}
          skeletonRows={SKELETON_ROW_COUNT.TABLE}
          skeletonColumnConfig={config}
          containerClassName='h-full'
        />
      </div>
    </WorkspacePage>
  );
}
