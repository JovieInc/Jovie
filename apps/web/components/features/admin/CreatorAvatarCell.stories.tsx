import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CreatorAvatarCell } from './CreatorAvatarCell';

const meta = {
  title: 'Features/Admin/CreatorAvatarCell',
  component: CreatorAvatarCell,
  parameters: { layout: 'centered' },
  args: {
    profileId: 'profile-1',
    username: 'alice',
    avatarUrl: null,
  },
} satisfies Meta<typeof CreatorAvatarCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: a creator with no avatar falls back to initials. */
export const EmptyNoAvatar: Story = {
  args: { avatarUrl: null },
};

/** Partial: a verified creator that is not featured. */
export const PartialVerifiedOnly: Story = {
  args: { verified: true, isFeatured: false },
};

/** Long content: a very long username used for the avatar alt text. */
export const LongContentUsername: Story = {
  args: {
    username: 'an-extremely-long-creator-handle-that-keeps-going-and-going',
    isFeatured: true,
  },
};

/** Rtl: the featured star anchors to the start corner in right-to-left. */
export const RtlFeatured: Story = {
  args: { isFeatured: true, username: 'ليلى' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
