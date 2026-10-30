import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Feed',
  component: OpportunityInboxFeed,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OpportunityInboxFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseCard: OpportunityInboxCardViewModel = {
  id: 'feed-card-1',
  sourceKind: 'test.suggestion',
  signalType: 'other',
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending',
  category: 'suggestion',
};

export const Default: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: null,
    pendingFeedbackId: null,
    pendingNextStepId: null,
    enableStackInteractions: false,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};

export const StackInteractions: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    enableStackInteractions: true,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};

export const Loading: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: 'feed-card-1',
    enableStackInteractions: true,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};
