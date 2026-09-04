import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibraryShareAssetCard } from './LibraryShareAssetCard';

const meta = {
  title: 'Library/LibraryShareAssetCard',
  component: LibraryShareAssetCard,
  parameters: { layout: 'centered' },
  args: {
    downloadsEnabled: false,
    layout: 'list',
    asset: {
      id: 'item-1',
      releaseId: 'release-1',
      title: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: '/art.jpg',
      previewUrl: null,
      lyrics: null,
      releaseType: 'single',
      releaseDate: '2026-01-15T00:00:00.000Z',
      smartLinkPath: '/tim/never-say-a-word',
      includeArtwork: true,
      includePreview: false,
      includeLyrics: false,
    },
  },
} satisfies Meta<typeof LibraryShareAssetCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
