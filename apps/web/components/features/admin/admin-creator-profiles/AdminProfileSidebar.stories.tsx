import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { Contact } from '@/types';
import { AdminProfileSidebar } from './AdminProfileSidebar';

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
  socialLinks: [
    {
      id: 'link-1',
      platform: 'instagram',
      platformType: 'instagram',
      url: 'https://instagram.com/alice',
      displayText: '@alice',
    },
  ],
} as AdminCreatorProfileRow;

const contact: Contact = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  socialLinks: [
    {
      id: 'link-1',
      label: '@alice',
      platformType: 'instagram',
      url: 'https://instagram.com/alice',
    },
  ],
};

const meta: Meta<typeof AdminProfileSidebar> = {
  title: 'Admin/AdminProfileSidebar',
  component: AdminProfileSidebar,
  decorators: [
    Story => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: {
    profile,
    contact,
    isOpen: true,
    onClose: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof AdminProfileSidebar>;

export const Claimed: Story = {};

export const Unclaimed: Story = {
  args: {
    profile: { ...profile, isClaimed: false, userId: null },
  },
};

export const Empty: Story = {
  args: {
    profile: null,
    contact: null,
  },
};
