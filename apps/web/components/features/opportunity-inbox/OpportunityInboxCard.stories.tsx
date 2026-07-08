import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxCard } from './OpportunityInboxCard';

const meta: Meta<typeof OpportunityInboxCard> = {
  title: 'Features/OpportunityInbox/OpportunityInboxCard',
  component: OpportunityInboxCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof OpportunityInboxCard>;

export const SuggestionCard: Story = {
  args: {
    card: {
      id: 'story-card-1',
      typeLabel: 'Suggestion',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Detroit listeners up 340% — book a show',
      why: 'A promoter at the Magic Stick reached out yesterday. Jovie tied it to your Spotify growth there.',
      primaryActionLabel: 'Review pitch',
      status: 'pending',
      category: 'suggestion',
    },
    onApprove: () => undefined,
    onDismiss: () => undefined,
    onFeedback: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};
