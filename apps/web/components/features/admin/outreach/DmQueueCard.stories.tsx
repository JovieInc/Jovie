import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DmQueueCard } from './DmQueueCard';

const meta = {
  title: 'Features/Admin/Outreach/DmQueueCard',
  component: DmQueueCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onMarkedSent'],
    },
  },
} satisfies Meta<typeof DmQueueCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    lead: {
      id: 'lead-1',
      displayName: 'River Lane',
      instagramHandle: 'riverlane',
      priorityScore: 80,
      dmCopy: 'Claim your page',
      outreachStatus: 'pending',
    },
  },
};

export const HeldForReview: Story = {
  args: {
    lead: {
      ...Default.args.lead,
      completenessEligible: false,
    },
  },
};

export const Eligible: Story = {
  args: {
    lead: {
      ...Default.args.lead,
      completenessEligible: true,
    },
  },
};
