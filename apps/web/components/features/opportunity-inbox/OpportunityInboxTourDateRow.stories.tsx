import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';

const meta = {
  title: 'Features/OpportunityInbox/TourDateRow',
  component: OpportunityInboxTourDateRow,
  args: {
    item: {
      id: 'tour-1',
      title: 'Detroit Show',
      startDate: '2026-11-01',
      startTime: null,
      venueName: 'Magic Stick',
      location: 'Detroit',
      providerLabel: 'Bandsintown',
      status: 'pending',
    },
    onConfirm: fn(),
    onReject: fn(),
    isBusy: false,
  },
} satisfies Meta<typeof OpportunityInboxTourDateRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const Busy: Story = { args: { isBusy: true } };
export const Confirmed: Story = {
  args: { item: { ...meta.args.item, status: 'confirmed' } },
};
export const Rejected: Story = {
  args: { item: { ...meta.args.item, status: 'rejected' } },
};
