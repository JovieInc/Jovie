import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { AdminSocialEnrichment } from '@/lib/queries';
import type { Contact } from '@/types';
import { AdminProfileSidebar } from './AdminProfileSidebar';

const socialLinks = [
  {
    id: 'link-1',
    platform: 'instagram',
    platformType: 'social',
    url: 'https://instagram.com/alice',
    displayText: '@alice',
  },
  {
    id: 'link-spotify',
    platform: 'spotify',
    platformType: 'music',
    url: 'https://open.spotify.com/artist/1234567890123456789012',
    displayText: 'Spotify',
  },
];

const profile: AdminCreatorProfileRow = {
  id: 'profile-1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
  displayName: 'Alice',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: 'user-1',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  confidence: 0.9,
  ingestionStatus: 'idle',
  location: 'Los Angeles, CA',
  hometown: null,
  activeSinceYear: 2020,
  lastIngestionError: null,
  socialLinks,
};

const contact: Contact = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  socialLinks: socialLinks.map(({ id, platform, platformType, url }) => ({
    id,
    label: platform === 'spotify' ? 'Spotify' : '@alice',
    platformType,
    url,
  })),
};

const conflictedEnrichment: AdminSocialEnrichment = {
  status: 'conflicted',
  checkedAt: '2026-09-26T00:00:00Z',
  sources: ['musicbrainz'],
  fields: {},
  conflicts: ['musicbrainz name mismatch'],
  musicbrainzId: 'mb-artist-1',
  shareReady: false,
};

const meta: Meta<typeof AdminProfileSidebar> = {
  title: 'Admin/CreatorProfiles/ProfileSidebar',
  component: AdminProfileSidebar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs', 'creators-a11y'],
  decorators: [
    Story => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return (
        <QueryClientProvider client={queryClient}>
          <div className='h-200 bg-base text-primary-token'>
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Claimed creator sidebar on the Social tab with linked destinations. */
export const Default: Story = {
  args: { profile, contact, isOpen: true, onClose: () => {} },
};

/**
 * Social tab with a conflicted identity-enrichment receipt below the
 * share-ready evidence bar (JOV-6529).
 */
export const EnrichmentConflicted: Story = {
  args: {
    profile,
    contact,
    enrichment: conflictedEnrichment,
    isOpen: true,
    onClose: () => {},
  },
};
