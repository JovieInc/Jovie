import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { ProviderCell } from './ProviderCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify' as ProviderKey,
      url: 'https://open.spotify.com/track/abc',
      path: '/smart/release-1?utm_source=spotify',
      label: 'Spotify',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const meta = {
  title: 'Dashboard/Organisms/Releases/Cells/ProviderCell',
  component: ProviderCell,
  parameters: {
    layout: 'centered',
    jovie: {
      // testId and releaseId are callback argument names, not props.
      uncoveredProps: ['testId', 'releaseId'],
    },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    release,
    provider: 'spotify' as ProviderKey,
    config: { label: 'Spotify', accent: '#22c55e' },
    onCopy: async () => 'copied',
  },
} satisfies Meta<typeof ProviderCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Linked: Story = {};

export const Missing: Story = {
  args: {
    release: { ...release, providers: [] },
  },
};
