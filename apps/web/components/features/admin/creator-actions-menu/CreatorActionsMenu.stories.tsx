import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { CreatorActionsMenu } from './CreatorActionsMenu';

// Real fixture shape, matching AdminProfileSidebar.stories.tsx.
const profile: AdminCreatorProfileRow = {
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
  title: 'Features/Admin/CreatorActionsMenu',
  component: CreatorActionsMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    profile,
    isMobile: false,
    status: 'idle',
    onToggleVerification: async () => {},
    onToggleFeatured: async () => {},
    onToggleMarketing: async () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof CreatorActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: {
    open: true,
  },
};

export const Mobile: Story = {
  args: {
    isMobile: true,
    open: true,
  },
};
