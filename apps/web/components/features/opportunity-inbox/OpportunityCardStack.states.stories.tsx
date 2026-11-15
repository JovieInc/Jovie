import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OpportunityCardStack } from './OpportunityCardStack';

const CARD = {
  id: 'card-1',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T12:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Review pitch',
  status: 'pending' as const,
  category: 'suggestion' as const,
};

const meta = {
  title: 'Features/Opportunity Inbox/Card Stack States',
  component: OpportunityCardStack,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    cards: [CARD],
    onAccept: fn(),
    onReject: fn(),
    onOpen: fn(),
  },
} satisfies Meta<typeof OpportunityCardStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one card with no peek stack behind it. */
export const PartialSingleCard: Story = {};

/** Long content: a long title and rationale with a full peek stack. */
export const LongContent: Story = {
  args: {
    cards: Array.from({ length: 4 }, (_, index) => ({
      ...CARD,
      id: `card-${index + 1}`,
      title:
        'Detroit listeners up 340% after the playlist add — book a headline show at a mid-size room before the tour routing locks',
      why: 'Promoter email matched your Detroit growth spike. The room holds 1,200 and the date sits between two routed shows.',
    })),
  },
};

/** Rtl: Arabic cards in a right-to-left document. */
export const Rtl: Story = {
  args: {
    cards: [
      {
        ...CARD,
        title: 'المستمعون في ديترويت ارتفعوا ٣٤٠٪ — احجز حفلة',
        why: 'رسالة المنظم تطابقت مع ارتفاع النمو في ديترويت.',
        primaryActionLabel: 'راجع العرض',
      },
      { ...CARD, id: 'card-2', title: 'تم اكتشاف أغنية جديدة' },
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
