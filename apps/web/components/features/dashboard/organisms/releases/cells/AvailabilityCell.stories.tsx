import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { AvailabilityCell } from './AvailabilityCell';

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
      key: 'spotify',
      url: 'https://open.spotify.com/album/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00Z',
      label: 'Spotify',
      path: '/spotify/release-1',
      isPrimary: true,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: 'https://cdn.example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

const providerConfig = PROVIDER_CONFIG;

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Cells/AvailabilityCell',
  component: AvailabilityCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    release,
    allProviders: ['spotify', 'apple_music'],
    providerConfig,
    onCopy: async (path: string, label: string, testId: string) => {
      await Promise.resolve(`${path}:${label}:${testId}`);
      return path;
    },
    onAddUrl: async (releaseId: string, provider: string, url: string) => {
      await Promise.resolve(`${releaseId}:${provider}:${url}`);
    },
  },
} satisfies Meta<typeof AvailabilityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoAddUrl: Story = {
  args: {
    onAddUrl: undefined,
  },
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
};
