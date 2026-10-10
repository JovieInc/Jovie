import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';

const asset: LibraryReleaseAsset = {
  id: 'inspector-fixture',
  title: 'Example release with a deliberately long title',
  artist: 'Example artist',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 17,
  smartLinkPath: '/example/release',
  releaseDate: '2026-04-28T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'draft',
  profileVisibility: 'hidden',
  trackCount: 1,
  providerCount: 0,
  providers: [],
  hasLyrics: false,
  hasArtwork: false,
  hasVideoLinks: false,
  assetKinds: [],
  genres: [],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: null,
  upc: null,
  distributor: null,
  totalDurationMs: null,
};

function RightPanelOutlet() {
  return useRightPanel();
}

function LibraryInspectorFixture() {
  return (
    <HeaderActionsProvider>
      <RightPanelProvider>
        <div
          className='flex min-h-0 overflow-hidden'
          style={{ height: 'calc(100svh - 2rem)' }}
        >
          <div className='min-w-0 flex-1 overflow-auto'>
            <LibrarySurface assets={[asset]} />
          </div>
          <RightPanelOutlet />
        </div>
      </RightPanelProvider>
    </HeaderActionsProvider>
  );
}

const meta = {
  title: 'Features/Library/LibraryInspector',
  component: LibraryInspectorFixture,
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof LibraryInspectorFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
