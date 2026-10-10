import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { LibraryLoadingState } from '@/app/app/(shell)/library/LibraryLoadingState';
import { LibrarySurface } from '@/app/app/(shell)/library/LibrarySurface';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { LibraryPostReleaseBundle } from '@/lib/library/post-release-types';

const release = {
  id: 'release-proof',
  title: 'A Deliberately Long Work Title That Still Identifies the Selection',
  artist: 'Tim White',
  artworkUrl: null,
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 27,
  smartLinkPath: '/tim/work-inspector-proof',
  releaseDate: '2026-10-02T00:00:00.000Z',
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'approved',
  profileVisibility: 'hidden',
  lifecycleStatus: 'active',
  trackCount: 1,
  providerCount: 2,
  providers: [
    {
      key: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/album/work-inspector-proof',
    },
    {
      key: 'appleMusic',
      label: 'Apple Music',
      url: 'https://music.apple.com/album/work-inspector-proof',
    },
  ],
  hasLyrics: false,
  hasArtwork: false,
  hasVideoLinks: false,
  assetKinds: ['providers'],
  genres: ['Electronic'],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: 'Independent',
  upc: '123456789012',
  primaryIsrc: 'USAAA2600001',
  distributor: null,
  totalDurationMs: 193_000,
  description:
    'A compact inspector proof with missing artwork and independent public states.',
  share: {
    assetId: 'release-proof',
    visibility: 'public',
    shareSlug: 'work-inspector-proof',
    accessToken: 'storybook-proof-token',
    shareUrl: 'https://jov.ie/tim/work-inspector-proof',
    tokenRevokedAt: null,
  },
  source: { provider: 'discography', canonicalId: 'catalog-release-proof' },
} satisfies LibraryReleaseAsset;

const postReleaseBundle = {
  downloads: [
    {
      id: 'download-proof',
      releaseId: release.id,
      title: 'Master WAV',
      fileName: 'master.wav',
    },
  ],
  findings: [],
  rightsholders: [
    {
      id: 'rightsholder-proof',
      subjectType: 'release',
      subjectId: release.id,
      partyName: 'Tim White',
      role: 'writer',
      domain: 'composition',
      evidenceClass: 'observed',
      source: 'songview',
      sourceWorkId: 'ASCAP-123456',
      sourceUrl: 'https://www.songview.com/',
      shareBps: null,
    },
  ],
  stats: [],
} satisfies LibraryPostReleaseBundle;

function RightPanelSlot() {
  const panel = useRightPanel();
  return (
    <aside className='w-90 shrink-0 border-l border-(--app-shell-border)'>
      {panel}
    </aside>
  );
}

function WorkInspectorProof({
  rowCount = 1,
  width,
  loading = false,
}: {
  readonly rowCount?: number;
  readonly width?: number;
  readonly loading?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const assets = Array.from({ length: rowCount }, (_, index) => ({
    ...release,
    id: index === 0 ? release.id : `${release.id}-${index}`,
    title: index === 0 ? release.title : `Work ${index}: ${release.title}`,
    artist: 'An artist name long enough to exercise narrow table disclosure',
    artworkUrl: index % 2 ? '/brand/Jovie-Logo-Icon.svg' : null,
  }));
  return (
    <RightPanelProvider>
      <Button onClick={() => setRevision(revision + 1)}>Refresh Fixture</Button>
      <div
        data-testid='library-browser-proof'
        data-revision={revision}
        className='flex h-screen bg-(--app-shell-content-surface)'
        style={{ width }}
      >
        <main className='min-w-0 flex-1 overflow-hidden'>
          {loading ? (
            <LibraryLoadingState />
          ) : (
            <LibrarySurface
              assets={assets}
              postReleaseBundle={postReleaseBundle}
            />
          )}
        </main>
        <RightPanelSlot />
      </div>
    </RightPanelProvider>
  );
}

const openInspector = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByTestId(`library-catalog-row-${release.id}`)
  );
};

const meta = {
  title: 'Library/WorkInspector',
  component: WorkInspectorProof,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
  },
} satisfies Meta<typeof WorkInspectorProof>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    await openInspector(canvasElement);
  },
};

export const Files: Story = {
  play: async ({ canvasElement }) => {
    await openInspector(canvasElement);
    await userEvent.click(
      await within(canvasElement).findByRole('tab', { name: 'Files' })
    );
  },
};

export const DenseScanWithInspector: Story = {
  args: { rowCount: 19, width: 892 },
  play: async ({ canvasElement }) => {
    await openInspector(canvasElement);
  },
};

export const VirtualizedDenseScan: Story = {
  args: { rowCount: 20, width: 892 },
  play: async ({ canvasElement }) => {
    await openInspector(canvasElement);
  },
};

export const DenseLoading: Story = {
  args: { width: 892, loading: true },
};
