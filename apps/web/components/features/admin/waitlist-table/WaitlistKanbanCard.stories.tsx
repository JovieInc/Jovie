import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

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
  heardAbout: null,
  status: 'new',
  primarySocialFollowerCount: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Admin/WaitlistKanbanCard',
  component: WaitlistKanbanCard,
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
        <div className='w-72'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof WaitlistKanbanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Invited: Story = {
  args: {
    entry: { ...entry, status: 'invited' },
  },
};

export const SignedUp: Story = {
  args: {
    entry: { ...entry, status: 'signed_up' },
  },
};

export const ReadOnly: Story = {
  args: {
    onApprove: undefined,
  },
};
