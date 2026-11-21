import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerIntelligenceCard } from './AiCrawlerIntelligenceCard';

const base: AiCrawlerAnalyticsResponse = {
  totalRequests: 420,
  weeklyRequests: 88,
  crawlers: [
    {
      id: 'gptbot',
      name: 'GPTBot',
      requests: 200,
      previousPeriodRequests: 150,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

function CardStory({
  data,
  failed = false,
  dir,
}: {
  readonly data: AiCrawlerAnalyticsResponse;
  readonly failed?: boolean;
  readonly dir?: 'rtl';
}) {
  const client = React.useMemo(() => {
    const created = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (failed) {
      created
        .getQueryCache()
        .build(created, {
          queryKey: queryKeys.dashboard.aiCrawlers(),
        })
        .setState({
          status: 'error',
          error: new Error('unavailable'),
          fetchStatus: 'idle',
        });
    } else {
      created.setQueryData(queryKeys.dashboard.aiCrawlers(), data);
    }
    return created;
  }, [data, failed]);

  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-90 bg-base p-3 text-primary-token'>
        <AiCrawlerIntelligenceCard onOpenDetail={() => undefined} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/AI Crawler/AiCrawlerIntelligenceCard/States',
  component: AiCrawlerIntelligenceCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AiCrawlerIntelligenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no crawler reads have been observed yet. */
export const EmptyNoReads: Story = {
  render: () => (
    <CardStory
      data={{ ...base, totalRequests: 0, weeklyRequests: 0, crawlers: [] }}
    />
  ),
};

/** Error: the analytics request failed. */
export const ErrorUnavailable: Story = {
  render: () => <CardStory data={base} failed />,
};

/** Partial: reads exist but none this week. */
export const PartialNoWeeklyReads: Story = {
  render: () => <CardStory data={{ ...base, weeklyRequests: 0 }} />,
};

/** Long content: a long crawler name and large counts truncate. */
export const LongContentCrawlerName: Story = {
  render: () => (
    <CardStory
      data={{
        ...base,
        totalRequests: 12_345_678,
        crawlers: [
          {
            id: 'long',
            name: 'An AI crawler service with an extremely long product name',
            requests: 12_345_678,
            previousPeriodRequests: 10,
          },
        ],
      }}
    />
  ),
};

/** Permission denied: free plans see the teaser with an upgrade action. */
export const PermissionDeniedFreeTeaser: Story = {
  render: () => <CardStory data={{ ...base, isPro: false, isTeaser: true }} />,
};

/** Rtl: the row in a right-to-left document. */
export const RtlRow: Story = {
  render: () => <CardStory data={base} dir='rtl' />,
};
