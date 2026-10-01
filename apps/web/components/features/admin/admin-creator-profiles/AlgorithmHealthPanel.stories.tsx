import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { Contact } from '@/types';
import { AlgorithmHealthPanel } from './AlgorithmHealthPanel';

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

const contact: Contact = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  socialLinks: [],
};

const meta = {
  title: 'Features/Admin/AlgorithmHealthPanel',
  component: AlgorithmHealthPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Neither the profile nor the contact carry a Spotify social link, so this renders the real "No Spotify Link" empty state — the same guard production hits before running the algorithm-health query.',
      },
    },
  },
  args: {
    profile,
    contact,
    isActive: true,
  },
} satisfies Meta<typeof AlgorithmHealthPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoSpotifyLink: Story = {};
