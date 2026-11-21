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
  title: 'Admin/Waitlist/WaitlistKanbanCard/States',
  component: WaitlistKanbanCard,
  parameters: { layout: 'centered' },
  args: { entry, onApprove: () => undefined },
  decorators: [
    function CardFrame(Story) {
      return (
        <div className='w-72'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof WaitlistKanbanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an entry with no social, Spotify or goal links to show. */
export const EmptyNoLinks: Story = {
  args: {
    entry: {
      ...entry,
      primarySocialUrlNormalized: null,
      spotifyUrlNormalized: null,
    } as WaitlistEntryRow,
    onApprove: undefined,
  },
};

/** Error: the last approve attempt failed and the action stays available. */
export const ErrorApproveFailed: Story = {
  args: { approveStatus: 'error' },
};

/** Partial: a signed-up entry whose action is locked. */
export const PartialSignedUp: Story = {
  args: { entry: { ...entry, status: 'signed_up' } as WaitlistEntryRow },
};

/** Long content: a long name, email and profile URL truncate. */
export const LongContentEntry: Story = {
  args: {
    entry: {
      ...entry,
      fullName: 'An applicant with an extraordinarily long full name',
      email:
        'an.extraordinarily.long.email.address@a-very-long-domain-name.example.com',
      primarySocialUrlNormalized:
        'https://instagram.com/a-profile-handle-that-goes-on-and-on-and-on',
    } as WaitlistEntryRow,
  },
};

/** Rtl: the card in a right-to-left board. */
export const RtlCard: Story = {
  args: { entry: { ...entry, fullName: 'ليلى أحمد' } as WaitlistEntryRow },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
