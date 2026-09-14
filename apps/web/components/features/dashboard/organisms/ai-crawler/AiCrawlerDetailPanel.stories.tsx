import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerDetailPanel } from './AiCrawlerDetailPanel';

const populatedAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 420,
  weeklyRequests: 88,
  crawlers: [
    {
      id: 'gptbot',
      name: 'GPTBot',
      requests: 200,
      previousPeriodRequests: 150,
    },
    {
      id: 'claudebot',
      name: 'ClaudeBot',
      requests: 120,
      previousPeriodRequests: 90,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

const zeroAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 0,
  weeklyRequests: 0,
  crawlers: [],
  dailyTrend: [],
  syncedAt: null,
  isPro: true,
  isTeaser: false,
};

const teaserAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 42,
  weeklyRequests: 10,
  crawlers: [
    {
      id: 'teaser-crawler',
      name: 'AI Crawler',
      requests: 42,
      previousPeriodRequests: 30,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: false,
  isTeaser: true,
};

function createStoryQueryClient(
  data: AiCrawlerAnalyticsResponse | null,
  loading: boolean
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  if (!loading) {
    const queryKey = queryKeys.dashboard.aiCrawlers();
    // Storybook's preview decorator also owns a QueryClient and intercepts
    // /api requests. Keep these state stories on their own immutable fixture
    // so the panel cannot consume that empty fallback or perform a live read.
    client.setQueryDefaults(queryKey, { enabled: false });
    client.setQueryData(queryKey, data);
  }

  return client;
}

function createAnalyticsFetchMock(
  response: AiCrawlerAnalyticsResponse | null,
  originalFetch: typeof fetch,
  loading: boolean
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/api/dashboard/ai-crawlers')) {
      return originalFetch(input, init);
    }
    if (loading) {
      return new Promise<Response>(() => undefined);
    }
    return Promise.resolve(
      new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    );
  }) as typeof fetch;
}

function AiCrawlerDetailStory({
  data,
  loading = false,
}: {
  readonly data: AiCrawlerAnalyticsResponse | null;
  readonly loading?: boolean;
}) {
  const queryClient = React.useMemo(
    () => createStoryQueryClient(data, loading),
    [data, loading]
  );
  const [ready, setReady] = React.useState(false);

  React.useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createAnalyticsFetchMock(data, originalFetch, loading);
    setReady(true);

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [data, loading]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <div className='min-h-180 w-90 overflow-hidden bg-base text-primary-token'>
        <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/AI Crawler/AiCrawlerDetailPanel',
  component: AiCrawlerDetailPanel,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },
  },
} satisfies Meta<typeof AiCrawlerDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  render: () => <AiCrawlerDetailStory data={populatedAnalytics} />,
};

export const MissingTelemetry: Story = {
  render: () => <AiCrawlerDetailStory data={null} />,
};

export const Loading: Story = {
  render: () => <AiCrawlerDetailStory data={null} loading />,
};

export const RealZero: Story = {
  render: () => <AiCrawlerDetailStory data={zeroAnalytics} />,
};

export const FreeTeaser: Story = {
  render: () => <AiCrawlerDetailStory data={teaserAnalytics} />,
};
