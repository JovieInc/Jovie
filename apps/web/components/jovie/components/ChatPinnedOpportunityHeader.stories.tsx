import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { ChatPinnedOpportunityHeader } from './ChatPinnedOpportunityHeader';

const card: OpportunityInboxCardViewModel = {
  id: 'opp_1',
  signalType: 'other',
  typeLabel: 'New song',
  createdAt: '2026-11-01T00:00:00.000Z',
  title: 'Pitch Sober to editorial playlists',
  why: 'The release goes live Friday and no playlist pitch is scheduled.',
  primaryActionLabel: 'Open pitch',
  status: 'pending',
  category: 'suggestion',
};

const meta = {
  title: 'Jovie/Components/ChatPinnedOpportunityHeader',
  component: ChatPinnedOpportunityHeader,
  parameters: { layout: 'centered' },
  decorators: [
    function HeaderFrame(Story) {
      return (
        <div className='w-full max-w-xl'>
          <Story />
        </div>
      );
    },
  ],
  args: { card, onUnpin: fn() },
} satisfies Meta<typeof ChatPinnedOpportunityHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: a card with no reason copy still renders title and unpin. */
export const EmptyWhy: Story = {
  args: { card: { ...card, why: '' } },
};

/** Long content: title truncates and the reason clamps to two lines. */
export const LongContentClamped: Story = {
  args: {
    card: {
      ...card,
      title:
        'Pitch the new single to every editorial playlist curator before Friday release day',
      why: 'The release goes live Friday, no playlist pitch is scheduled, the artwork is approved, the master is delivered and three curators asked for early access last week.',
    },
  },
};

/** Rtl: right-to-left copy aligns to the inline start. */
export const RtlCopy: Story = {
  args: {
    card: {
      ...card,
      typeLabel: 'أغنية جديدة',
      title: 'قدّم الأغنية إلى قوائم التشغيل',
      why: 'الإصدار يبدأ يوم الجمعة ولا يوجد طلب مجدول.',
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
