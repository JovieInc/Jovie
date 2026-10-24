import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

const entry = {
  id: 'waitlist_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: null,
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
} as WaitlistEntryRow;

const meta = {
  title: 'Admin/Waitlist/WaitlistKanbanCard',
  component: WaitlistKanbanCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    entry,
    onApprove: () => undefined,
  },
} satisfies Meta<typeof WaitlistKanbanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Approving: Story = {
  args: {
    approveStatus: 'approving',
  },
};

export const Approved: Story = {
  args: {
    entry: { ...entry, status: 'approved' } as WaitlistEntryRow,
  },
};

export const ReadOnly: Story = {
  args: {
    onApprove: undefined,
  },
};
