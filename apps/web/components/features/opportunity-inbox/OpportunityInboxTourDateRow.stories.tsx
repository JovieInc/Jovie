import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';

const meta: Meta<typeof OpportunityInboxTourDateRow> = {
  title: 'Features/OpportunityInbox/OpportunityInboxTourDateRow',
  component: OpportunityInboxTourDateRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    item: {
      id: 'tour-date-troubadour',
      title: 'The Troubadour, Los Angeles',
      startDate: '2026-11-05',
      startTime: '20:00',
      venueName: 'The Troubadour',
      location: 'Los Angeles, CA',
      providerLabel: 'Bandsintown',
      status: 'pending',
    },
    onConfirm: () => undefined,
    onReject: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Confirmed: Story = {
  args: {
    item: {
      id: 'tour-date-troubadour-confirmed',
      title: 'The Troubadour, Los Angeles',
      startDate: '2026-11-05',
      startTime: '20:00',
      venueName: 'The Troubadour',
      location: 'Los Angeles, CA',
      providerLabel: 'Bandsintown',
      status: 'confirmed',
    },
  },
};
