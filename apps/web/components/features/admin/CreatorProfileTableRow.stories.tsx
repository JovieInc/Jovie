import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CreatorProfileTableRow } from './CreatorProfileTableRow';

const profile = {
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
  ingestionStatus: 'idle' as const,
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [],
};

const meta = {
  title: 'Features/Admin/CreatorProfileTableRow',
  component: CreatorProfileTableRow,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['onSendInvite', 'disabled', 'loading'],
    },
  },
  decorators: [
    Story => (
      <table className='w-full bg-base text-primary-token'>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
  args: {
    profile,
    rowNumber: 1,
    isSelected: false,
    isChecked: false,
    isMobile: false,
    verificationStatus: 'idle',
    refreshIngestStatus: 'idle',
    isMenuOpen: false,
    onRowClick: fn(),
    onContextMenu: fn(),
    onToggleSelect: fn(),
    onMenuOpenChange: fn(),
    onRefreshIngest: fn(),
    onToggleVerification: fn(),
    onToggleFeatured: fn(),
    onToggleMarketing: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof CreatorProfileTableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: {
    isSelected: true,
    isChecked: true,
  },
};
