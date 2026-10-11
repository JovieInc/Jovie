import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import '@/styles/system-b-app.css';
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
        <div className='h-160 w-90'>
          <Story />
        </div>
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

export const ClaimedLight: Story = {
  parameters: { themes: { themeOverride: 'light' } },
};

export const Unclaimed: Story = {
  args: {
    profile: { ...profile, isClaimed: false, userId: null },
  },
};

export const LongIdentity: Story = {
  args: {
    profile: {
      ...profile,
      displayName: 'The Very Long Artist Name and Collaborating Orchestra',
      username: 'long-artist-name-and-orchestra',
      location: 'San Francisco, California',
      isVerified: true,
    },
  },
};

export const Empty: Story = {
  args: {
    profile: null,
    contact: null,
  },
};
