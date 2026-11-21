import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { CreatorActionsMenu } from './CreatorActionsMenu';

const profile = {
  id: 'profile-1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice',
  bio: 'Indie pop artist',
  genres: ['Pop'],
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: 'user-1',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
} as AdminCreatorProfileRow;

const meta = {
  title: 'Features/Admin/CreatorActionsMenu/States',
  component: CreatorActionsMenu,
  parameters: { layout: 'centered' },
  args: {
    profile,
    isMobile: false,
    status: 'idle',
    open: true,
    onToggleVerification: async () => {},
    onToggleFeatured: async () => {},
    onToggleMarketing: async () => {},
    onDelete: () => {},
  },
  decorators: [
    function MenuStateFrame(Story) {
      return (
        <div className='flex min-h-72 w-full max-w-sm justify-end p-4'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof CreatorActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an unclaimed creator with no claim token offers no invite action. */
export const EmptyUnclaimedNoToken: Story = {
  args: { profile: { ...profile, isClaimed: false, claimToken: null } },
};

/** Error: the last action failed, so the mobile trigger shows the error ring. */
export const ErrorActionFailed: Story = {
  args: { isMobile: true, status: 'error', open: false },
};

/** Partial: a featured, verified creator with ingest refresh available. */
export const PartialFeaturedVerified: Story = {
  args: {
    profile: { ...profile, isFeatured: true, isVerified: true },
    onRefreshIngest: async () => {},
  },
};

/** Long content: a very long username in the profile link. */
export const LongContentUsername: Story = {
  args: {
    isMobile: true,
    profile: {
      ...profile,
      username: 'an-extremely-long-creator-handle-that-keeps-going-and-going',
    },
  },
};

/** Offline: an ingest refresh in flight disables the trigger. */
export const OfflineRefreshInFlight: Story = {
  args: {
    open: false,
    refreshIngestStatus: 'loading',
    onRefreshIngest: async () => {},
  },
};

/** Rtl: the menu inside a right-to-left admin table. */
export const RtlMenu: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-sm'>
          <Story />
        </div>
      );
    },
  ],
};
