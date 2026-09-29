import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { LibraryShareAssetLayouts } from './LibraryShareAssetLayouts';

const artwork = getMarketingExportImage('tim-white-profile-live-mobile');

const assets: LibraryShareDropAsset[] = [
  {
    id: 'asset-1',
    releaseId: 'release-1',
    title: 'The Deep End',
    artistName: 'Tim White',
    artworkUrl: artwork.publicUrl,
    previewUrl: null,
    lyrics: null,
    releaseType: 'single',
    releaseDate: '2026-06-01',
    smartLinkPath: '/tim/the-deep-end',
    includeArtwork: true,
    includePreview: false,
    includeLyrics: false,
  },
  {
    id: 'asset-2',
    releaseId: 'release-2',
    title: 'Signals',
    artistName: 'Tim White',
    artworkUrl: artwork.publicUrl,
    previewUrl: null,
    lyrics: null,
    releaseType: 'album',
    releaseDate: '2026-03-01',
    smartLinkPath: '/tim/signals',
    includeArtwork: true,
    includePreview: false,
    includeLyrics: false,
  },
];

const meta = {
  title: 'Features/LibraryShare/LibraryShareAssetLayouts',
  component: LibraryShareAssetLayouts,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    assets,
    downloadsEnabled: true,
  },
} satisfies Meta<typeof LibraryShareAssetLayouts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  args: {
    layout: 'grid',
  },
};

export const List: Story = {
  args: {
    layout: 'list',
  },
};

export const Reel: Story = {
  args: {
    layout: 'reel',
  },
};

export const Empty: Story = {
  args: {
    assets: [],
    layout: 'grid',
  },
};
