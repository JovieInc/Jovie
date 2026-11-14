import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
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

function CardDecorator(Story: () => ReactNode) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
}

function RtlCardDecorator(Story: () => ReactNode) {
  return (
    <div className='w-72' dir='rtl'>
      <Story />
    </div>
  );
}

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const LONG_EMAIL =
  'aurelia.montgomery.fitzgerald.management@extraordinarily-long-label-name.example.com';

/** State coverage for the waitlist board card. */
const meta = {
  title: 'Admin/Waitlist/WaitlistKanbanCard States',
  component: WaitlistKanbanCard,
  parameters: { layout: 'centered' },
  args: { entry, onApprove: fn() },
} satisfies Meta<typeof WaitlistKanbanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a failed approval leaves the button enabled so it can be retried. */
export const ErrorApproveFailed: Story = {
  args: { approveStatus: 'error' },
  decorators: [CardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Approve' })).toBeEnabled();
  },
};

/** Partial: no goal, social link, Spotify link or approve action. */
export const PartialEntry: Story = {
  args: {
    entry: {
      ...entry,
      primarySocialUrlNormalized: '',
      spotifyUrl: null,
      spotifyUrlNormalized: null,
      spotifyArtistName: null,
    } as WaitlistEntryRow,
    onApprove: undefined,
  },
  decorators: [CardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Ari Lane' })
    ).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
    await expect(canvas.queryByText('Spotify:')).toBeNull();
  },
};

/** Long content: a long name, email and social link truncate in the card. */
export const LongContentEntry: Story = {
  args: {
    entry: {
      ...entry,
      fullName: LONG_NAME,
      email: LONG_EMAIL,
      primarySocialUrlNormalized:
        'https://instagram.com/aurelia.montgomery.fitzgerald.official.account',
    } as WaitlistEntryRow,
  },
  decorators: [CardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: LONG_NAME })).toHaveClass(
      'truncate'
    );
    await expect(canvas.getByText(LONG_EMAIL)).toHaveClass('truncate');
  },
};

/** Right-to-left: the name, badge and action inside an RTL document. */
export const RtlEntry: Story = {
  args: {
    entry: { ...entry, fullName: 'ليلى الحسن' } as WaitlistEntryRow,
  },
  decorators: [RtlCardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'ليلى الحسن' })
    ).toBeVisible();
  },
};
