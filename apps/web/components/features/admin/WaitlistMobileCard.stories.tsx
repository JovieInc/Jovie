import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistMobileCard } from './WaitlistMobileCard';

const entry: WaitlistEntryRow = {
  id: 'wl_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: 'streams',
  primarySocialUrl: 'https://instagram.com/ari',
  primarySocialPlatform: 'instagram',
  primarySocialUrlNormalized: 'https://instagram.com/ari',
  spotifyUrl: 'https://open.spotify.com/artist/ari',
  spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
  spotifyArtistName: 'Ari Lane',
  heardAbout: 'A friend',
  status: 'new',
  primarySocialFollowerCount: 12800,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Admin/WaitlistMobileCard',
  component: WaitlistMobileCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    entry,
    approveStatus: 'idle',
    onApprove: () => {},
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='w-90'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof WaitlistMobileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Approved: Story = {
  args: {
    entry: { ...entry, status: 'approved' },
  },
};

export const SignedUp: Story = {
  args: {
    entry: { ...entry, status: 'signed_up' },
  },
};

export const Approving: Story = {
  args: {
    approveStatus: 'approving',
  },
};
