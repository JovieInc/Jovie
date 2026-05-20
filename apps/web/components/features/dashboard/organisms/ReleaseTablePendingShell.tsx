import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';

interface ReleaseTablePendingShellProps {
  readonly showHeader?: boolean;
  readonly testId?: string;
}

type ReleaseLoadingRow = {
  readonly id: string;
  readonly release: string;
  readonly status: string;
  readonly date: string;
  readonly platforms: string;
  readonly actions: string;
};

const releaseLoadingColumnHelper = createColumnHelper<ReleaseLoadingRow>();

const RELEASE_LOADING_COLUMNS = [
  releaseLoadingColumnHelper.accessor('release', {
    id: 'release',
    header: 'Release',
    size: 9999,
    minSize: 220,
  }),
  releaseLoadingColumnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    size: 112,
    minSize: 92,
    meta: { className: 'hidden md:table-cell' },
  }),
  releaseLoadingColumnHelper.accessor('date', {
    id: 'date',
    header: 'Release Date',
    size: 128,
    minSize: 112,
    meta: { className: 'hidden lg:table-cell' },
  }),
  releaseLoadingColumnHelper.accessor('platforms', {
    id: 'platforms',
    header: 'Platforms',
    size: 112,
    minSize: 92,
    meta: { className: 'hidden md:table-cell' },
  }),
  releaseLoadingColumnHelper.accessor('actions', {
    id: 'actions',
    header: '',
    size: 72,
    minSize: 64,
  }),
] as ColumnDef<ReleaseLoadingRow, unknown>[];

const RELEASE_LOADING_SKELETON_CONFIG = [
  { variant: 'release' as const, width: '100%' },
  { variant: 'badge' as const, width: '74px' },
  { variant: 'meta' as const, width: '96px' },
  { variant: 'avatar' as const, width: '84px' },
  { variant: 'button' as const, width: '56px' },
];

export function ReleaseTablePendingShell({
  showHeader = true,
  testId = 'releases-loading',
}: Readonly<ReleaseTablePendingShellProps>) {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Releases'
      frame='content-container'
      contentPadding='none'
      data-testid={testId}
      toolbar={
        showHeader ? (
          <PageToolbar
            start={
              <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
                <span
                  className='inline-block h-3 w-28 rounded-sm skeleton motion-reduce:animate-none align-middle'
                  aria-hidden='true'
                />
              </span>
            }
          />
        ) : undefined
      }
    >
      <UnifiedTableSkeleton<ReleaseLoadingRow>
        columns={RELEASE_LOADING_COLUMNS}
        skeletonRows={SKELETON_ROW_COUNT.TABLE}
        skeletonColumnConfig={RELEASE_LOADING_SKELETON_CONFIG}
        rowHeight={56}
        minWidth='0'
        containerClassName='h-full px-2.5 pb-2.5 pt-1'
      />
    </PageShell>
  );
}
