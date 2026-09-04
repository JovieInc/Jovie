import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OpportunityCardStack } from './OpportunityCardStack';

const CARDS = [
  {
    id: 'card-1',
    signalType: 'other' as const,
    typeLabel: 'Suggestion',
    createdAt: '2026-09-01T12:00:00.000Z',
    title: 'Detroit listeners up 340% — book a show',
    why: 'Promoter email matched your Detroit growth spike.',
    primaryActionLabel: 'Review pitch',
    status: 'pending' as const,
    category: 'suggestion' as const,
  },
  {
    id: 'card-2',
    signalType: 'new_song' as const,
    typeLabel: 'New Song',
    createdAt: '2026-08-31T10:00:00.000Z',
    title: 'New single detected',
    why: 'Spotify catalog signal.',
    primaryActionLabel: 'Set up release',
    status: 'pending' as const,
    category: 'suggestion' as const,
  },
] as const;

const meta = {
  title: 'Features/Opportunity Inbox/Card Stack',
  component: OpportunityCardStack,
  parameters: { layout: 'fullscreen' },
  render: args => <OpportunityCardStack {...args} />,
  decorators: [
    Story => (
      <div className='mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    cards: CARDS,
    onAccept: fn(),
    onReject: fn(),
    onOpen: fn(),
  },
} satisfies Meta<typeof OpportunityCardStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PendingAction: Story = {
  args: { pendingActionId: 'card-1' },
};

export const Empty: Story = {
  args: { cards: [] },
};
