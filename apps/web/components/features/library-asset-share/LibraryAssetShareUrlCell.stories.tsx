import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import { LibraryAssetShareUrlCell } from './LibraryAssetShareUrlCell';

const ASSET = {
  id: 'release-1',
  title: 'Take Me Over',
} as LibraryReleaseAsset;

const SHARE = {
  assetId: ASSET.id,
  visibility: 'private',
  shareSlug: 'take-me-over',
  accessToken: 'story-token',
  shareUrl: 'https://jov.ie/p/story-token',
  tokenRevokedAt: null,
} satisfies LibraryAssetShareViewModel;

const withCellWidth: Decorator = function WithCellWidth(Story) {
  return (
    <div className='w-56'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-56'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Library/LibraryAssetShareUrlCell',
  component: LibraryAssetShareUrlCell,
  parameters: { layout: 'centered' },
  decorators: [withCellWidth],
  args: { asset: ASSET, share: SHARE },
} satisfies Meta<typeof LibraryAssetShareUrlCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A shared asset with its copyable URL. */
export const Default: Story = {};

/** Empty: the asset has no share yet, so the cell shows a dash. */
export const EmptyNoShare: Story = {
  args: { share: null },
};

/** Long content: a long share URL truncates inside the cell. */
export const LongContentUrl: Story = {
  args: {
    share: {
      ...SHARE,
      shareUrl: `https://jov.ie/p/${'midnight-drive-extended-'.repeat(4)}token`,
    },
  },
};

/** Right-to-left: an Arabic asset title in an Arabic document direction. */
export const RtlArabicTitle: Story = {
  args: { asset: { ...ASSET, title: 'منتصف الليل' } },
  decorators: [withRtlDocument],
};
