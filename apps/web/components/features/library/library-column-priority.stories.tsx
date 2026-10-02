import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LIBRARY_TABLE_COLUMNS } from '@/app/app/(shell)/library/LibrarySurface';
import { LIBRARY_CATALOG_TABLE_COLUMNS } from '@/components/features/library/library-catalog-columns';
import { UnifiedTable } from '@/components/organisms/table';

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
  providers: [],
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
} as LibraryReleaseAsset;

function Frame({
  width,
  columns,
}: {
  readonly width: number;
  readonly columns: typeof LIBRARY_TABLE_COLUMNS;
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
  render: () => <Frame width={532} columns={LIBRARY_TABLE_COLUMNS} />,
};

export const ListWide: Story = {
  render: () => <Frame width={1100} columns={LIBRARY_TABLE_COLUMNS} />,
};

export const CatalogPanelOpen: Story = {
  render: () => (
    <Frame width={532} columns={LIBRARY_CATALOG_TABLE_COLUMNS} />
  ),
};
