import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryInspectorAssetSlots } from './LibraryInspectorAssetSlots';

const populatedAsset = {
  id: 'release-1',
  title: 'Take Me Over',
  artist: 'Tim White',
  artworkUrl: 'https://cdn.example.com/artwork.jpg',
  previewUrl: null,
  videoUrl: null,
  waveformSeed: 1,
  smartLinkPath: '/tim/take-me-over',
  releaseDate: null,
  releaseType: 'single',
  status: 'released',
  approvalStatus: 'draft',
  profileVisibility: 'visible',
  trackCount: 1,
  providerCount: 0,
  providers: [],
  hasLyrics: false,
  hasArtwork: true,
  hasVideoLinks: false,
  assetKinds: ['artwork'],
  genres: [],
  spotifyPopularity: null,
  targetPlaylistCount: 0,
  isExplicit: false,
  label: null,
  upc: null,
  distributor: null,
  totalDurationMs: null,
} satisfies LibraryReleaseAsset;

const meta = {
  title: 'Library/LibraryInspectorAssetSlots',
  component: LibraryInspectorAssetSlots,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    asset: populatedAsset,
    downloads: [],
    disabled: false,
    defaultSectionOpen: true,
  },
} satisfies Meta<typeof LibraryInspectorAssetSlots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedArtwork: Story = {};

export const EmptyArtwork: Story = {
  args: {
    asset: {
      ...populatedAsset,
      artworkUrl: null,
      hasArtwork: false,
    },
  },
};

export const PopulatedStems: Story = {
  args: {
    downloads: [
      {
        id: 'stem-1',
        releaseId: 'release-1',
        title: 'Kick',
        fileName: 'kick.wav',
      },
    ],
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
