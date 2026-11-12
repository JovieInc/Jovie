import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fireEvent, fn, within } from 'storybook/test';
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
        role='img'
        aria-label='The Deep End artwork'
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

const openMenu: Story['play'] = async ({ canvasElement }) => {
  fireEvent.contextMenu(
    within(canvasElement).getByRole('img', { name: 'The Deep End artwork' })
  );
  await expect(
    await within(document.body).findByRole('menu')
  ).toBeInTheDocument();
};

/** No download sizes for this release: the artwork renders with no menu. */
export const EmptyNoSizes: Story = {
  args: { sizes: [] },
};

/** Downloads are off but the owner can still revert the artwork. */
export const PartialRevertOnly: Story = {
  args: { allowDownloads: false, canRevert: true, onRevert: fn() },
  play: openMenu,
};

/** Every size preset plus revert, the longest menu the artwork shows. */
export const ManySizesWithRevert: Story = {
  args: {
    canRevert: true,
    onRevert: fn(),
    sizes: [
      { key: 'original', label: 'Original', url: ARTWORK_URL },
      { key: '1000', label: '1000 × 1000', url: ARTWORK_URL },
      { key: '500', label: '500 × 500', url: ARTWORK_URL },
      { key: '250', label: '250 × 250', url: ARTWORK_URL },
    ],
  },
  play: openMenu,
};

/** The open download menu inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: openMenu,
};
