import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { AlbumArtworkContextMenu } from './AlbumArtworkContextMenu';

const ARTWORK_URL = getMarketingExportImage(
  'tim-white-profile-live-mobile'
).publicUrl;

const meta = {
  title: 'Features/Release/AlbumArtworkContextMenu',
  component: AlbumArtworkContextMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Right-click on the artwork below to open the download-size context menu.',
      },
    },
  },
  args: {
    title: 'The Deep End',
    allowDownloads: true,
    sizes: [
      { key: 'original', label: 'Original', url: ARTWORK_URL },
      { key: '1000', label: '1000 × 1000', url: ARTWORK_URL },
      { key: '500', label: '500 × 500', url: ARTWORK_URL },
    ],
    children: (
      <div
        className='h-40 w-40 rounded-lg bg-surface-2'
        style={{
          backgroundImage: `url(${ARTWORK_URL})`,
          backgroundSize: 'cover',
        }}
      />
    ),
  },
} satisfies Meta<typeof AlbumArtworkContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDownloads: Story = {};

export const NoDownloadsAllowed: Story = {
  args: {
    allowDownloads: false,
  },
};
