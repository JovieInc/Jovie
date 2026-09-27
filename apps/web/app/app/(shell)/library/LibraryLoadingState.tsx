'use client';

import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table/molecules/PageToolbar';
import { UnifiedTableSkeleton } from '@/components/organisms/table/organisms/UnifiedTableSkeleton';
import { alignment } from '@/components/organisms/table/table.styles';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import type { ColumnDef } from '@/lib/tanstack-table';
import type { LibraryReleaseAsset, LibraryView } from './library-data';

/**
 * Library loading skeleton.
 *
 * The app shell layout renders this as the first-boot fallback for every
 * authed route, so it must not import `LibrarySurface`: that module is the
 * whole Library feature and would ship to every /app page. The columns carry
 * geometry only (id, header, size, minSize, className), which is all the
 * skeleton reads. `LibraryLoadingState.test.ts` pins them to the live table.
 */

export const LIBRARY_TABLE_ROW_HEIGHT = 56;
export const LIBRARY_TABLE_MIN_WIDTH = '0';

export const LIBRARY_VIEW_FILTER_CHIP_KEYS: readonly LibraryView[] = [
  'all',
  'releases',
  'merch',
  'images',
  'videos',
  'audio',
  'documents',
  'archived',
];

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
  { variant: 'badge', width: '108px' },
  { variant: 'badge', width: '92px' },
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
    meta: { className: alignment.workspaceSeamX },
  },
  {
    id: 'releaseDate',
    header: 'Release Date',
    size: 112,
    minSize: 96,
    meta: { className: 'pl-2 pr-3' },
  },
  {
    id: 'status',
    header: 'Release',
    size: 112,
    minSize: 96,
    meta: { className: 'hidden md:table-cell px-2' },
  },
  {
    id: 'approval',
    header: 'Approval',
    size: 128,
    minSize: 108,
    meta: { className: 'hidden md:table-cell px-2' },
  },
  {
    id: 'type',
    header: 'Type',
    size: 104,
    minSize: 88,
    meta: { className: 'hidden lg:table-cell px-2' },
  },
  {
    id: 'providers',
    header: 'Providers',
    size: 120,
    minSize: 96,
    meta: { className: 'hidden md:table-cell px-2' },
  },
  {
    id: 'shareUrl',
    header: 'Share URL',
    size: 220,
    minSize: 180,
    meta: { className: 'hidden lg:table-cell px-2' },
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

export function LibraryLoadingState() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Library'
      frame='content-container'
      contentPadding='none'
      data-testid='library-surface-loading'
      toolbar={
        <PageToolbar
          start={
            <div
              className='flex min-w-0 flex-wrap items-center gap-1'
              data-testid='library-view-filter-chips'
            >
              {LIBRARY_VIEW_FILTER_CHIP_KEYS.map(key => (
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
      <UnifiedTableSkeleton<LibraryReleaseAsset>
        columns={LIBRARY_TABLE_SKELETON_COLUMNS}
        hideHeader
        rowHeight={LIBRARY_TABLE_ROW_HEIGHT}
        minWidth={LIBRARY_TABLE_MIN_WIDTH}
        skeletonRows={SKELETON_ROW_COUNT.TABLE}
        skeletonColumnConfig={LIBRARY_TABLE_SKELETON_CONFIG}
        containerClassName='h-full'
      />
    </PageShell>
  );
}
