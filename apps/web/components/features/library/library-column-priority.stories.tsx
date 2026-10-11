import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  formatLibraryReleaseDate,
  formatLibraryReleaseDateTitle,
  type LibraryReleaseAsset,
} from '@/app/app/(shell)/library/library-data';
import {
  formatLibraryItemType,
  LIBRARY_CATALOG_TABLE_COLUMNS,
  LibraryCatalogProvidersCell,
  LibraryCatalogStatusCell,
} from '@/components/features/library/library-catalog-columns';
import { LibraryAssetShareUrlCell } from '@/components/features/library-asset-share/LibraryAssetShareUrlCell';
import { UnifiedTable } from '@/components/organisms/table';
import { alignment } from '@/components/organisms/table/table.styles';
import {
  formatLibraryApprovalStatus,
  libraryApprovalStatusClasses,
} from '@/lib/library/approval-status';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

/**
 * Same priority budgets as `LIBRARY_TABLE_COLUMNS`. This story does not import
 * `LibrarySurface`: that module pulls native Statsig bindings into Vite and
 * stalls Storybook. The unit test locks the real column set.
 */
const column = createColumnHelper<LibraryReleaseAsset>();

const listColumns = [
  column.accessor('title', {
    id: 'release',
    header: 'Item',
    cell: ({ row }) => (
      <span className='min-w-0'>
        <span className='system-b-library-release-title block truncate'>
          {row.original.title}
        </span>
        <span className='system-b-library-release-meta mt-0.5 block truncate'>
          {row.original.artist}
        </span>
      </span>
    ),
    minSize: 220,
    size: 9999,
    enableSorting: false,
    meta: { className: alignment.workspaceSeamX, primary: true, minWidth: 220 },
  }),
  column.display({
    id: 'releaseDate',
    header: 'Release Date',
    cell: ({ row }) => (
      <span
        className='system-b-library-meta-text block whitespace-nowrap text-right tabular-nums text-tertiary-token'
        title={formatLibraryReleaseDateTitle(row.original.releaseDate)}
      >
        {row.original.releaseDate
          ? formatLibraryReleaseDate(row.original.releaseDate)
          : 'No date'}
      </span>
    ),
    size: 112,
    minSize: 96,
    meta: {
      className: 'pl-2 pr-3',
      priority: 5,
      minWidth: 112,
      compact: asset => formatLibraryReleaseDate(asset.releaseDate),
    },
  }),
  column.display({
    id: 'status',
    header: 'Release',
    cell: ({ row }) => <LibraryCatalogStatusCell asset={row.original} />,
    size: 112,
    minSize: 96,
    meta: {
      className: 'px-2',
      priority: 4,
      minWidth: 112,
      compact: asset => <LibraryCatalogStatusCell asset={asset} />,
    },
  }),
  column.display({
    id: 'approval',
    header: 'Approval',
    cell: ({ row }) => (
      <span
        role='status'
        className={cn(
          'system-b-library-status-pill inline-flex h-6 w-fit max-w-full items-center truncate rounded-full border px-2 leading-4',
          libraryApprovalStatusClasses(row.original.approvalStatus)
        )}
      >
        {formatLibraryApprovalStatus(row.original.approvalStatus)}
      </span>
    ),
    size: 128,
    minSize: 108,
    meta: {
      className: 'px-2',
      priority: 4,
      minWidth: 128,
      compact: asset => formatLibraryApprovalStatus(asset.approvalStatus),
    },
  }),
  column.display({
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text truncate text-tertiary-token'>
        {formatLibraryItemType(row.original)}
      </span>
    ),
    size: 104,
    minSize: 88,
    meta: {
      className: 'px-2',
      priority: 2,
      minWidth: 104,
      compact: asset => formatLibraryItemType(asset),
    },
  }),
  column.display({
    id: 'providers',
    header: 'Providers',
    cell: ({ row }) => <LibraryCatalogProvidersCell asset={row.original} />,
    size: 120,
    minSize: 96,
    meta: {
      className: 'px-2',
      priority: 3,
      minWidth: 120,
      compact: asset => <LibraryCatalogProvidersCell asset={asset} />,
    },
  }),
  column.display({
    id: 'shareUrl',
    header: 'Share URL',
    cell: ({ row }) => (
      <LibraryAssetShareUrlCell
        asset={row.original}
        share={row.original.share}
      />
    ),
    size: 220,
    minSize: 180,
    enableSorting: false,
    meta: {
      className: 'px-2',
      priority: 1,
      minWidth: 220,
      compact: asset => asset.smartLinkPath,
    },
  }),
  column.display({
    id: 'actions',
    header: 'Actions',
    cell: () => null,
    size: 40,
    minSize: 40,
    enableSorting: false,
    meta: {
      className: 'w-10 pl-1 pr-2',
      headerVisibility: 'sr-only',
      actionVisibility: 'contextual',
    },
  }),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
  artist: 'Tim White',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 17,
  smartLinkPath: '/tim/take-me-over',
  releaseDate: '2026-04-28T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'draft',
  profileVisibility: 'visible',
  trackCount: 1,
  providerCount: 1,
  providers: [
    { key: 'spotify', label: 'Spotify', url: 'https://open.spotify.com' },
  ],
  hasLyrics: false,
  hasArtwork: true,
  hasVideoLinks: false,
  assetKinds: [],
  genres: [],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: null,
  upc: null,
  distributor: null,
  totalDurationMs: 186000,
  share: {
    shareUrl: 'https://jovie.link/tim/take-me-over',
  },
} as unknown as LibraryReleaseAsset;

function Frame({
  width,
  columns,
}: {
  readonly width: number;
  readonly columns: ColumnDef<LibraryReleaseAsset, unknown>[];
}) {
  return (
    <div className='space-y-2' style={{ width }}>
      <p className='text-2xs text-tertiary-token tabular-nums'>
        {width}px container
      </p>
      <UnifiedTable
        data={[asset]}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
        caption='Library'
      />
    </div>
  );
}

const meta: Meta = {
  title: 'Features/Library/ColumnPriority',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

export const ListPanelOpen: Story = {
  render: () => <Frame width={532} columns={listColumns} />,
};

export const ListWide: Story = {
  render: () => <Frame width={1100} columns={listColumns} />,
};

export const CatalogPanelOpen: Story = {
  render: () => <Frame width={532} columns={LIBRARY_CATALOG_TABLE_COLUMNS} />,
};
