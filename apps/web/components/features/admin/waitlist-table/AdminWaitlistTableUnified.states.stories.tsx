import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';

function entry(overrides: Partial<WaitlistEntryRow> = {}): WaitlistEntryRow {
  return {
    id: 'waitlist_1',
    fullName: 'Ari Lane',
    email: 'ari@example.com',
    primaryGoal: null,
    primarySocialUrl: 'https://instagram.com/ari',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/ari',
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: null,
    status: 'new',
    decisionReason: null,
    wants: null,
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  } as WaitlistEntryRow;
}

function FrameDecorator(Story: () => ReactNode) {
  return (
    <div className='flex h-96 flex-col bg-base text-primary-token'>
      <Story />
    </div>
  );
}

function RtlFrameDecorator(Story: () => ReactNode) {
  return (
    <div className='flex h-96 flex-col bg-base text-primary-token' dir='rtl'>
      <Story />
    </div>
  );
}

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

/** State coverage for the waitlist table. */
const meta: Meta<typeof AdminWaitlistTableUnified> = {
  title: 'Admin/Tables/Waitlist States',
  component: AdminWaitlistTableUnified,
  parameters: { layout: 'fullscreen' },
  args: {
    entries: [entry()],
    page: 1,
    pageSize: 25,
    total: 1,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the next page is being fetched under the rows already shown. */
export const LoadingNextPage: Story = {
  args: { total: 60, hasNextPage: true, isFetchingNextPage: true },
  decorators: [FrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('columnheader', { name: /^Name/ })
    ).toBeVisible();
  },
};

/** Held and not-fit decisions retain the evidence in the person's words. */
export const DecisionOutcomes: Story = {
  args: {
    entries: [
      entry({
        status: 'queued',
        decisionReason: 'hold_capacity_full',
        wants: 'objection: I cannot prepare every release twice',
      }),
      entry({
        id: 'waitlist_2',
        fullName: 'Bea',
        email: 'bea@example.com',
        status: 'disqualified',
        decisionReason: 'disqualified_wrong_audience',
        wants: 'current_tool: my existing workflow',
      }),
    ],
    total: 2,
  },
  decorators: [FrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Queued (held)')).toBeVisible();
    await expect(canvas.getByText('Not a fit')).toBeVisible();
    await expect(canvas.getByText('hold_capacity_full')).toBeVisible();
    await expect(canvas.getByText('disqualified_wrong_audience')).toBeVisible();
    await expect(
      canvas.getByText('objection: I cannot prepare every release twice')
    ).toBeVisible();
    await expect(
      canvas.getByText('current_tool: my existing workflow')
    ).toBeVisible();
  },
};

/** Long content: long values in every text column of one row. */
export const LongContentEntry: Story = {
  args: {
    entries: [
      entry({
        fullName: LONG_NAME,
        email:
          'aurelia.montgomery.fitzgerald.management@extraordinarily-long-label-name.example.com',
        primarySocialUrl:
          'https://instagram.com/aurelia.montgomery.fitzgerald.official.account',
        primarySocialUrlNormalized:
          'https://instagram.com/aurelia.montgomery.fitzgerald.official.account',
        heardAbout:
          'A friend at the label showcase mentioned it after the spring remix package went out',
      }),
      entry({ id: 'waitlist_2', fullName: 'Bea', email: 'bea@example.com' }),
    ],
    total: 2,
  },
  decorators: [FrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('columnheader', { name: /^Heard About/ })
    ).toBeInTheDocument();
  },
};

/** Right-to-left: the table inside an RTL document. */
export const RtlEntries: Story = {
  args: { entries: [entry({ fullName: 'ليلى الحسن' })] },
  decorators: [RtlFrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('columnheader', { name: /^Name/ })
    ).toBeVisible();
  },
};
