import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseArtwork } from './ReleaseArtwork';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseArtwork',
  component: ReleaseArtwork,
  parameters: {
    layout: 'centered',
  },
  args: {
    artworkUrl: 'https://placehold.co/600x600',
    title: 'Midnight Drive',
    artistName: 'Jordan Lee',
    canUploadArtwork: false,
    allowDownloads: false,
    releaseId: 'release-1',
  },
} satisfies Meta<typeof ReleaseArtwork>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const Editable: Story = {
  args: {
    canUploadArtwork: true,
    onArtworkUpload: async () => 'https://placehold.co/600x600',
  },
};

export const Fallback: Story = {
  args: {
    artworkUrl: null,
  },
};
