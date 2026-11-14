import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { OutreachStatusBadge } from './OutreachStatusBadge';

const meta = {
  title: 'Features/Admin/Outreach/OutreachStatusBadge',
  component: OutreachStatusBadge,
  parameters: { layout: 'centered' },
  args: { status: 'queued' },
} satisfies Meta<typeof OutreachStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {};

export const Sent: Story = { args: { status: 'sent' } };

export const PendingReview: Story = {
  args: { status: 'pending_review' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('pending review')
    ).toBeVisible();
  },
};

/** Error: a failed send uses the error badge. */
export const ErrorFailedSend: Story = {
  args: { status: 'failed' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('failed')).toBeVisible();
  },
};

/** A status the map does not know falls back to the neutral badge. */
export const UnknownStatus: Story = { args: { status: 'on_hold' } };
