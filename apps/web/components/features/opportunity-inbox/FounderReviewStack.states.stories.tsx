import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { FounderReviewStack } from './FounderReviewStack';

type StackCard = OpportunityInboxCardViewModel & {
  readonly sourceKind: string;
};

const baseCard = {
  id: 'opportunity-1',
  sourceKind: 'test.suggestion',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending' as const,
  category: 'suggestion' as const,
} as StackCard;

const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Stack States',
  component: FounderReviewStack,
  parameters: { layout: 'fullscreen' },
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onReject: () => {},
    onOpen: () => {},
    pendingActionId: null,
    keyboardControlRef: { current: null },
  },
} satisfies Meta<typeof FounderReviewStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing in the founder queue, so the stack renders nothing. */
export const EmptyQueue: Story = {
  args: { cards: [] },
};

/** Partial: the card has no source visual, so a placeholder shows. */
export const PartialNoVisual: Story = {};

/** Long content: a long title and rationale in a queue of many cards. */
export const LongContent: Story = {
  args: {
    cards: Array.from({ length: 12 }, (_, index) => ({
      ...baseCard,
      id: `opportunity-${index + 1}`,
      title:
        'Detroit listeners up 340% after the playlist add — book a headline show at a mid-size room before the tour routing locks',
      why: 'Promoter email matched your Detroit growth spike. The room holds 1,200, the date sits between two routed shows, and the promoter offered a guarantee plus a door split once the room passes eighty percent.',
    })),
  },
};

/** Rtl: an Arabic card in a right-to-left document. */
export const Rtl: Story = {
  args: {
    cards: [
      {
        ...baseCard,
        typeLabel: 'اقتراح',
        title: 'المستمعون في ديترويت ارتفعوا ٣٤٠٪ — احجز حفلة',
        why: 'رسالة المنظم تطابقت مع ارتفاع النمو في ديترويت.',
      },
    ],
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
