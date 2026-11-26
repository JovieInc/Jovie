import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { CreatorActionsMenuContent } from './CreatorActionsMenuContent';

const profile: AdminCreatorProfileRow = {
  id: 'profile-1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: 'user-1',
  createdAt: null,
  ingestionStatus: 'idle',
  location: null,
  hometown: null,
  activeSinceYear: null,
  lastIngestionError: null,
};

function renderItem({
  children,
  disabled,
  href,
  onClick,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  const className =
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-app text-primary-token';
  return href ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <button
      type='button'
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function renderSeparator() {
  return <hr className='my-1 border-subtle' />;
}

const meta = {
  title: 'Features/Admin/CreatorActionsMenu/Content',
  component: CreatorActionsMenuContent,
  parameters: { layout: 'centered' },
  args: {
    profile,
    status: 'idle',
    copySuccess: false,
    onToggleVerification: async () => {},
    onToggleFeatured: async () => {},
    onToggleMarketing: async () => {},
    onDelete: () => {},
    onCopyClaimLink: async () => {},
    renderItem,
    renderSeparator,
  },
  decorators: [
    function ContentFrame(Story) {
      return (
        <div className='flex w-64 flex-col rounded-lg border border-subtle bg-surface-1 p-1'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof CreatorActionsMenuContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: an unclaimed creator without a claim token offers no claim link. */
export const EmptyNoClaimToken: Story = {
  args: { profile: { ...profile, isClaimed: false, claimToken: null } },
};

/** Error: the last action failed and the refresh item is disabled. */
export const ErrorActionFailed: Story = {
  args: {
    status: 'error',
    refreshIngestStatus: 'loading',
    onRefreshIngest: async () => {},
  },
};

/** Partial: a featured, verified creator with a claim link ready to copy. */
export const PartialFeaturedUnclaimed: Story = {
  args: {
    profile: {
      ...profile,
      isFeatured: true,
      isVerified: true,
      isClaimed: false,
      claimToken: 'claim-token',
    },
    onSendInvite: () => {},
  },
};

/** Long content: a very long username in the profile link target. */
export const LongContentUsername: Story = {
  args: {
    profile: {
      ...profile,
      username: 'an-extremely-long-creator-handle-that-keeps-going-and-going',
    },
  },
};

/** Loading: an ingest refresh in flight disables the refresh item. */
export const LoadingRefreshInFlight: Story = {
  args: {
    status: 'loading',
    onRefreshIngest: async () => {},
  },
};

/** Rtl: the menu content inside a right-to-left surface. */
export const RtlContent: Story = {
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
