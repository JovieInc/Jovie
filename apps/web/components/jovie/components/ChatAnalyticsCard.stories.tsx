import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
