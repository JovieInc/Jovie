import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { InsightResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';

const insight: InsightResponse = {
  id: 'insight-story',
  insightType: 'subscriber_surge',
  category: 'growth',
  priority: 'high',
  title: 'Audience growth accelerated',
  description: 'Weekly listeners increased 38% after the single went live.',
  actionSuggestion: 'Pin the single to the top of your profile this week.',
  confidence: '0.92',
  status: 'active',
  periodStart: '2026-08-11T00:00:00.000Z',
  periodEnd: '2026-08-18T00:00:00.000Z',
  createdAt: '2026-08-18T00:00:00.000Z',
  expiresAt: '2026-09-18T00:00:00.000Z',
};

/**
 * State coverage for InsightCard, the row the insights workspace renders for
 * each insight. Each state changes only the insight record or the document
 * direction; the actions use the preview QueryClient.
 */
const meta = {
  title: 'Dashboard/Insights/InsightCard',
  component: InsightCard,
  parameters: {
    layout: 'centered',
  },
  args: { insight },
  render: args => (
    <div className='w-140 max-w-full'>
      <InsightCard {...args} />
    </div>
  ),
} satisfies Meta<typeof InsightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a low-priority insight with no suggested action. */
export const PartialNoSuggestion: Story = {
  args: {
    insight: {
      ...insight,
      priority: 'low',
      category: 'timing',
      actionSuggestion: null,
    },
  },
};

/** Long content: a long title, description and suggestion wrap in the card. */
export const LongContentInsight: Story = {
  args: {
    insight: {
      ...insight,
      priority: 'medium',
      category: 'geographic',
      title:
        'Listeners in São Paulo, Mexico City and Bogotá more than doubled after the remix landed on regional editorial playlists',
      description:
        'Streams from Latin America grew 212% week over week, led by saves on the remix. Most new listeners arrived from editorial playlists and stayed for at least two more tracks, which suggests the audience is ready for a regional push.',
      actionSuggestion:
        'Schedule a Spanish-language post for release week and add the remix to the top of your smart link so new listeners land on it first.',
    },
  },
};

/** Right-to-left: an Arabic insight inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    insight: {
      ...insight,
      title: 'تسارع نمو الجمهور',
      description: 'ارتفع عدد المستمعين الأسبوعيين بعد إطلاق الأغنية.',
      actionSuggestion: 'ثبّت الأغنية أعلى ملفك الشخصي هذا الأسبوع.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
