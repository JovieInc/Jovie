import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

const asset = {
  id: 'release-1',
  title: 'Midnight Drive',
} as unknown as LibraryReleaseAsset;

const meta = {
  title: 'Features/Library/LibraryAssetSharePanel',
  component: LibraryAssetSharePanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onShareChange', 'artistHandle'],
    },
  },
  args: {
    asset,
    profileId: 'profile-1',
    disabled: false,
    initialShare: {
      assetId: 'release-1',
      visibility: 'private',
      shareSlug: 'midnight-drive',
      accessToken: 'token-1',
      shareUrl: 'https://jov.ie/p/token-1',
      tokenRevokedAt: null,
    },
  },
  decorators: [
    Story => (
      <div className='w-96 p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LibraryAssetSharePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShareLinkRow: Story = {};

export const Generating: Story = {
  args: {
    initialShare: null,
  },
};

export const DisabledPanel: Story = {
  args: {
    disabled: true,
  },
};
