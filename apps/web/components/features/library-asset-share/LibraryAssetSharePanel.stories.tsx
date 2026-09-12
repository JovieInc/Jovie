import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

const meta = {
  title: 'Features/Library/LibraryAssetSharePanel',
  component: LibraryAssetSharePanel,
  args: {
    asset: { id: 'r1', title: 'Drive' } as LibraryReleaseAsset,
    profileId: 'p1',
    artistHandle: 'tim',
    disabled: false,
    onShareChange: () => undefined,
  },
} satisfies Meta<typeof LibraryAssetSharePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShareLinkRow: Story = {};
