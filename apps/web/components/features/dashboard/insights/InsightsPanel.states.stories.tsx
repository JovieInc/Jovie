import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { InsightResponse } from '@/types/insights';
import { InsightsPanelView } from './InsightsPanel';

function makeInsight(
  id: string,
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id,
    insightType: 'subscriber_surge',
    category: 'growth',
    priority: 'high',
    title: 'Audience growth accelerated',
    description: 'Weekly listeners increased 38% after the single went live.',
    actionSuggestion: null,
    confidence: '0.92',
    status: 'active',
    periodStart: '2026-08-11T00:00:00.000Z',
    periodEnd: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    expiresAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * State coverage for the insights workspace. Same args and frame as the
 * canonical Dashboard/Insights/Workspace stories; each state changes only the
 * insight list, the Generate failure or the document direction.
 */
const meta = {
  title: 'Dashboard/Insights/Workspace States',
  component: InsightsPanelView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/app/insights' } },
  },
  args: {
    insights: [],
    isLoading: false,
    error: null,
    selectedCategory: 'all',
    onCategoryChange: fn(),
    onGenerate: fn(),
    onRetry: fn(),
    isGenerating: false,
  },
  render: args => (
    <div className='flex h-168 bg-base'>
      <InsightsPanelView {...args} />
    </div>
  ),
} satisfies Meta<typeof InsightsPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only medium-priority insights, so the other groups are absent. */
export const PartialOneGroup: Story = {
  args: {
    insights: [
      makeInsight('m-1', {
        priority: 'medium',
        category: 'geographic',
        title: 'Listeners in Berlin doubled',
      }),
      makeInsight('m-2', {
        priority: 'medium',
        category: 'platform',
        title: 'Apple Music saves are rising',
      }),
    ],
  },
};

/** Long content: many insights with long titles across every priority. */
export const LongContentManyInsights: Story = {
  args: {
    insights: [
      ...['high', 'medium', 'low'].flatMap(priority =>
        [1, 2, 3].map(n =>
          makeInsight(`${priority}-${n}`, {
            priority: priority as InsightResponse['priority'],
            title: `Listeners in São Paulo, Mexico City and Bogotá more than doubled after the remix landed on regional playlists (${priority} ${n})`,
            description:
              'Streams from Latin America grew 212% week over week, led by saves on the remix. Most new listeners stayed for at least two more tracks.',
            actionSuggestion:
              'Schedule a Spanish-language post for release week and move the remix to the top of your smart link.',
          })
        )
      ),
    ],
  },
};

/** Offline: the Generate reply was lost to the network, so the run reads as still working. */
export const OfflineGenerateLost: Story = {
  args: {
    generateFailed: true,
    generateFailure: { status: null, kind: 'network' },
  },
};

/** Permission denied: Generate is gated by the plan (403), linking to billing. */
export const PermissionDeniedNeedsPlan: Story = {
  args: { generateFailed: true, generateFailure: { status: 403 } },
};

/** Right-to-left: loaded insights inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    insights: [
      makeInsight('rtl-1', {
        title: 'تسارع نمو الجمهور',
        description: 'ارتفع عدد المستمعين الأسبوعيين بعد إطلاق الأغنية.',
      }),
    ],
  },
  render: args => (
    <div dir='rtl' className='flex h-168 bg-base'>
      <InsightsPanelView {...args} />
    </div>
  ),
};
