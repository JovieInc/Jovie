import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';

function card(
  id: string,
  title: string,
  why: string
): OpportunityInboxCardViewModel {
  return {
    id,
    signalType: 'other',
    typeLabel: 'Suggestion',
    title,
    why,
    createdAt: '2026-01-15T12:00:00.000Z',
    primaryActionLabel: 'Review',
    status: 'pending',
    category: 'suggestion',
  };
}

const meta = {
  title: 'Chat/EmptyState/OpportunityCards States',
  component: ChatEmptyStateOpportunityCards,
  args: { cards: [], onSelect: fn() },
  decorators: [
    Story => (
      <div className='w-full max-w-md max-w-full p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatEmptyStateOpportunityCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no pending opportunities, so the rail renders nothing. */
export const EmptyNoOpportunities: Story = {};

/** Long content: wrapping titles and reasons, and five cards capped at three. */
export const LongContentCappedAtThree: Story = {
  args: {
    cards: [
      card(
        'long-1',
        'Detroit listeners up 340% since the remix landed on two editorial playlists',
        'A promoter at a mid-size venue reached out about a date next month, and your saves there doubled week over week.'
      ),
      card(
        'long-2',
        'Your latest single is peaking in three cities at once this week',
        'Pitch the follow-up now while the playlist window is open and curators are still adding it.'
      ),
      card(
        'long-3',
        'Campaign results',
        'Streams rose 12% during the presave push, mostly from returning listeners.'
      ),
      card('long-4', 'Fourth card stays hidden', 'Capped.'),
      card('long-5', 'Fifth card stays hidden', 'Capped.'),
    ],
  },
};

/** Right-to-left: Arabic card copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    cards: [
      card(
        'rtl-1',
        'راجع قائمة الإصدار',
        'تحقق من الغلاف والاعتمادات والروابط قبل الإصدار.'
      ),
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
