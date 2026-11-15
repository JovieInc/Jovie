import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ProfileContactHeader } from './ProfileContactHeader';

const meta = {
  title: 'Features/Dashboard/ProfileContactSidebar/ProfileContactHeader',
  component: ProfileContactHeader,
  parameters: {
    layout: 'centered',
  },
  args: {
    displayName: 'Alex Rivera',
    username: 'alex',
    avatarUrl: null,
    releaseCount: 12,
    linkCount: 5,
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileContactHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Editable: Story = {
  args: {
    editable: true,
    onDisplayNameChange: fn(),
    onUsernameChange: fn(),
    onAvatarUpload: fn(async () => 'https://example.com/avatar.png'),
  },
};

/** A new profile: no name, handle, avatar or counts yet. */
export const EmptyNewProfile: Story = {
  args: {
    displayName: '',
    username: '',
    releaseCount: 0,
    linkCount: 0,
    editable: true,
    onDisplayNameChange: fn(),
  },
};

/** The avatar image fails to load, so the initials fallback shows. */
export const ErrorBrokenAvatar: Story = {
  args: {
    avatarUrl: 'data:image/png;base64,broken',
  },
};

/** Links counted, releases not loaded: only the link count shows. */
export const PartialCounts: Story = {
  args: {
    releaseCount: undefined,
    linkCount: 1,
  },
};

/** Long name and handle truncate inside the rail width. */
export const LongContentIdentity: Story = {
  args: {
    displayName:
      'The Extremely Long Artist Name Of A Collective With Many Members',
    username: 'the-extremely-long-artist-handle-for-a-whole-collective',
    releaseCount: 1_204,
    linkCount: 98,
  },
};

export const RtlIdentity: Story = {
  args: {
    displayName: 'ليلى حداد',
    username: 'layla',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
