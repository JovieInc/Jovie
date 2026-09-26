import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { Contact } from '@/types';
import { AdminProfileSidebar } from './AdminProfileSidebar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const baseProfile: AdminCreatorProfileRow = {
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
    {
      id: 'link-spotify',
      platform: 'spotify',
      platformType: 'spotify',
      url: 'https://open.spotify.com/artist/1234567890123456789012',
      displayText: 'Spotify',
    },
  ],
};

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
    {
      id: 'link-spotify',
      label: 'Spotify',
      platformType: 'spotify',
      url: 'https://open.spotify.com/artist/1234567890123456789012',
    },
  ],
};

const meta = {
  title: 'Admin/CreatorProfiles/AdminProfileSidebar',
  component: AdminProfileSidebar,
  args: {
    profile: baseProfile,
    contact,
    isOpen: true,
    onClose: fn(),
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='h-200 bg-base'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AdminProfileSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Claimed: Story = {};

export const UnclaimedNotChecked: Story = {
  args: {
    profile: {
      ...baseProfile,
      isClaimed: false,
      userId: null,
      identityEnrichment: null,
    },
  },
};

export const UnclaimedVerifiedShareReady: Story = {
  args: {
    profile: {
      ...baseProfile,
      isClaimed: false,
      userId: null,
      identityEnrichment: {
        status: 'verified',
        observedAt: '2026-09-26T00:00:00.000Z',
        sources: ['musicfetch'],
        provider: 'spotify',
        providerArtistId: 'sp-1',
        verifiedPlatforms: ['spotify', 'instagram'],
        conflicts: [],
        linksFound: 2,
        shareReady: true,
      },
    },
  },
};

export const UnclaimedConflicted: Story = {
  args: {
    profile: {
      ...baseProfile,
      isClaimed: false,
      userId: null,
      identityEnrichment: {
        status: 'conflicted',
        observedAt: '2026-09-26T00:00:00.000Z',
        sources: ['musicfetch'],
        provider: 'spotify',
        providerArtistId: 'sp-1',
        verifiedPlatforms: ['spotify'],
        conflicts: [
          {
            platform: 'instagram',
            urls: ['https://instagram.com/a', 'https://instagram.com/b'],
            resolvedUrl: null,
          },
        ],
        linksFound: 2,
        shareReady: false,
      },
    },
  },
};

export const Empty: Story = {
  args: {
    profile: null,
    contact: null,
  },
};
