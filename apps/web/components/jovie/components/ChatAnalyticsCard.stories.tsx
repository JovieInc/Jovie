import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ChatInsightsToolResult } from '@/components/jovie/types';
import { ChatAnalyticsCard } from './ChatAnalyticsCard';

const result: ChatInsightsToolResult = {
  success: true,
  title: 'Top signals',
  totalActive: 1,
  insights: [
    {
      id: 'insight-1',
      insightType: 'city_growth',
      category: 'growth',
      priority: 'high',
      title: 'Fans in Austin are trending up',
      description: 'Austin traffic increased week over week.',
      actionSuggestion: 'Schedule a show announcement for Austin.',
      confidence: '0.87',
      status: 'active',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-07T00:00:00.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
      expiresAt: '2026-03-15T00:00:00.000Z',
    },
  ],
};

const meta = {
  title: 'Jovie/Components/ChatAnalyticsCard',
  component: ChatAnalyticsCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['result'],
    },
  },
} satisfies Meta<typeof ChatAnalyticsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { result },
};

const baseInsight = result.insights[0];

/**
 * Empty: the insights tool succeeded but found no active signals, so the card
 * renders nothing and the transcript shows only the reply text.
 */
export const EmptyNoActiveSignals: Story = {
  args: { result: { ...result, totalActive: 0, insights: [] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('chat-analytics-card')
    ).toBeNull();
  },
};

/**
 * Long content: three signals with long titles out of twelve active, so the
 * count reads "Showing 3 of 12" and View all links to the insights page.
 */
export const LongContentManySignals: Story = {
  args: {
    result: {
      ...result,
      title: 'Top signals across your catalogue, audience and upcoming shows',
      totalActive: 12,
      insights: [
        {
          ...baseInsight,
          id: 'insight-long-1',
          title:
            'Fans in Austin, Houston and San Antonio are trending up after the Midnight Drive deluxe release',
          actionSuggestion:
            'Schedule a Texas show announcement and pin the deluxe smart link to the top of your profile before the weekend.',
        },
        {
          ...baseInsight,
          id: 'insight-long-2',
          insightType: 'release_momentum',
          category: 'content',
          title:
            'Midnight Drive (Deluxe Anniversary Edition) is getting more saves than any release this year',
          actionSuggestion: null,
          description:
            'Saves rose for three straight weeks while skips stayed flat across every connected platform.',
        },
        {
          ...baseInsight,
          id: 'insight-long-3',
          insightType: 'subscriber_surge',
          category: 'engagement',
          title: 'Your email list grew faster than your follower count',
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('chat-analytics-signal-count')
    ).toHaveTextContent('Showing 3 of 12 active signals');
    await expect(canvas.getByRole('link', { name: 'View all' })).toBeVisible();
  },
};

/** Right-to-left: an Arabic signal card inside an RTL transcript. */
export const RtlArabicSignal: Story = {
  args: {
    result: {
      ...result,
      title: 'أبرز الإشارات',
      insights: [
        {
          ...baseInsight,
          title: 'المعجبون في القاهرة في ازدياد',
          actionSuggestion: 'أعلن عن حفلة في القاهرة هذا الشهر.',
        },
      ],
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
