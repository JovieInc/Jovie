import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibraryAssetShareSurface } from './LibraryAssetShareSurface';
import { WEB194_PRIVATE_ASSET_VIEW } from './LibraryAssetShareSurface.stories';

/** Rendered states of the public asset share page body. */
const meta = {
  title: 'Public/Routes/LibraryAssetPrivateShare/States',
  component: LibraryAssetShareSurface,
  parameters: { layout: 'fullscreen' },
  args: { view: WEB194_PRIVATE_ASSET_VIEW },
} satisfies Meta<typeof LibraryAssetShareSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** Partial: a public release with no artwork, preview or smart link yet. */
export const PartialNoArtworkPublic: Story = {
  args: {
    view: {
      ...WEB194_PRIVATE_ASSET_VIEW,
      artworkUrl: null,
      previewUrl: null,
      smartLinkPath: null,
      visibility: 'public',
    },
  },
};

/** Long content: a long release title and artist name that wrap. */
export const LongContentTitle: Story = {
  args: {
    view: {
      ...WEB194_PRIVATE_ASSET_VIEW,
      title:
        'Midnight Drive (Extended Club Mix featuring Every Remix From the Summer Tour Edition)',
      artistName: 'Tim White, The Late Night Collective and Friends',
    },
  },
};

/** Right-to-left: an Arabic title in an Arabic document direction. */
export const RtlArabicTitle: Story = {
  args: {
    view: {
      ...WEB194_PRIVATE_ASSET_VIEW,
      title: 'منتصف الليل على الطريق',
    },
  },
  decorators: [withRtlDocument],
};
