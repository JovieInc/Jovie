import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent } from 'storybook/test';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { DeleteCreatorDialog } from './DeleteCreatorDialog';

const profile: AdminCreatorProfileRow = {
  id: 'creator_1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice Artist',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [],
};

/** State coverage for the single creator delete confirmation. */
const meta = {
  title: 'Features/Admin/DeleteCreatorDialog',
  component: DeleteCreatorDialog,
  parameters: { layout: 'centered' },
  args: {
    profile,
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(async () => ({ success: true })),
  },
} satisfies Meta<typeof DeleteCreatorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the delete fails and the dialog stays open with the server's reason. */
export const ErrorDeleteFailed: Story = {
  args: {
    onConfirm: fn(async () => ({
      success: false,
      error: 'Profile is linked to an active payout and cannot be deleted.',
    })),
  },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Profile' })
    );
    await expect(
      await screen.findByText(
        'Profile is linked to an active payout and cannot be deleted.'
      )
    ).toBeVisible();
  },
};

/** Long content: a claimed account with a long handle lists every data class. */
export const LongContentClaimedLongHandle: Story = {
  args: {
    profile: {
      ...profile,
      username: 'an-artist-with-a-remarkably-long-handle-name-2026',
      isClaimed: true,
      userId: 'user_1',
    },
  },
  play: async () => {
    await expect(
      await screen.findByRole('alertdialog', { name: 'Delete User Account' })
    ).toBeVisible();
    await expect(
      screen.getByText('User account and authentication')
    ).toBeVisible();
  },
};

/** Right-to-left: the confirmation inside an RTL document. */
export const RtlDocument: Story = {
  args: { profile: { ...profile, username: 'فنان' } },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async () => {
    await expect(
      await screen.findByRole('alertdialog', { name: 'Delete Creator Profile' })
    ).toBeVisible();
  },
};
