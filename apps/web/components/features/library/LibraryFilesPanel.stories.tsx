import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryFilesPanel } from './LibraryFilesPanel';

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
  artworkUrl: 'https://cdn.example.com/artwork.jpg',
  hasArtwork: true,
} as LibraryReleaseAsset;

const meta = {
  title: 'Library/LibraryFilesPanel',
  component: LibraryFilesPanel,
  args: {
    asset,
    downloads: [],
    disabled: false,
  },
} satisfies Meta<typeof LibraryFilesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PopulatedArtwork: Story = {};
export const EmptyFiles: Story = {
  args: { asset: { ...asset, artworkUrl: null, hasArtwork: false } },
};
