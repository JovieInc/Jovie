import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseCell } from './ReleaseCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: 'https://cdn.example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Cells/ReleaseCell',
  component: ReleaseCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    release,
    artistName: 'Jovie Artist',
  },
} satisfies Meta<typeof ReleaseCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoPreview: Story = {
  args: {
    release: { ...release, previewUrl: null },
  },
};
