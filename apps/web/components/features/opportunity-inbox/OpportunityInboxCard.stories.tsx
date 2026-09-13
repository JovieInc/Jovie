import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OpportunityInboxCard } from './OpportunityInboxCard';

const meta = {
  title: 'Features/OpportunityInbox/Card',
  component: OpportunityInboxCard,
  parameters: {
    jovie: { uncoveredProps: ['rating'] },
  },
  args: {
    card: {
      id: 'card-1',
      signalType: 'other',
      typeLabel: 'Suggestion',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Detroit listeners up 340% — book a show',
      why: 'Promoter email matched your Detroit growth spike.',
      primaryActionLabel: 'Review pitch',
      status: 'pending',
      category: 'suggestion',
    },
    onApprove: fn(),
    onDismiss: fn(),
    onFeedback: fn(),
  },
} satisfies Meta<typeof OpportunityInboxCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editorial: Story = {};
