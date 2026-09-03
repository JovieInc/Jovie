import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxPageClient } from './OpportunityInboxPageClient';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Page Client',
  component: OpportunityInboxPageClient,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OpportunityInboxPageClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    inbox: { cards: [], emptyActionCards: [] },
    connectedDSPs: [],
    initialLinks: [],
  },
  render: args => (
    <div className='flex h-[32rem] bg-(--app-shell-content-surface)'>
      <OpportunityInboxPageClient {...args} />
    </div>
  ),
};

export const WithCards: Story = {
  args: {
    inbox: {
      cards: [
        {
          id: 'card-1',
          sourceKind: 'test.suggestion',
          signalType: 'other' as const,
          typeLabel: 'Suggestion',
          createdAt: '2026-09-01T18:00:00.000Z',
          title: 'Detroit listeners up 340% — book a show',
          why: 'Promoter email matched your Detroit growth spike.',
          primaryActionLabel: 'Review pitch',
          status: 'pending' as const,
          category: 'suggestion' as const,
        },
      ],
      emptyActionCards: [],
    },
    connectedDSPs: [],
    initialLinks: [],
  },
  render: args => (
    <div className='flex h-[32rem] bg-(--app-shell-content-surface)'>
      <OpportunityInboxPageClient {...args} />
    </div>
  ),
};
