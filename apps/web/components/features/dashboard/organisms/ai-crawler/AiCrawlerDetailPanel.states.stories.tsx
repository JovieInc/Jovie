import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerDetailPanel } from './AiCrawlerDetailPanel';

/**
 * Certification states for the AI crawler panel. The default and loading
 * stories live in AiCrawlerDetailPanel.stories.tsx.
 */

const zeroAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 0,
  weeklyRequests: 0,
  crawlers: [],
  dailyTrend: [],
  syncedAt: null,
  isPro: true,
  isTeaser: false,
};

const longAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 1_284_930,
  weeklyRequests: 312_448,
  crawlers: [
    {
      id: 'long-1',
      name: 'Extremely Long Experimental Research Crawler Name From A Lab',
      requests: 900_000,
      previousPeriodRequests: 450_000,
    },
    {
      id: 'gptbot',
      name: 'GPTBot',
      requests: 200_000,
      previousPeriodRequests: 210_000,
    },
    {
      id: 'claudebot',
      name: 'ClaudeBot',
      requests: 120_000,
      previousPeriodRequests: 90_000,
    },
    {
      id: 'perplexity',
      name: 'PerplexityBot',
      requests: 40_000,
      previousPeriodRequests: 0,
    },
    {
      id: 'google',
      name: 'Google-Extended',
      requests: 20_000,
      previousPeriodRequests: 15_000,
    },
    {
      id: 'bytespider',
      name: 'Bytespider',
      requests: 4_930,
      previousPeriodRequests: 5_000,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
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

const rtlAnalytics: AiCrawlerAnalyticsResponse = {
  ...longAnalytics,
  crawlers: [
    {
      id: 'rtl-1',
      name: 'زاحف الذكاء الاصطناعي للأبحاث',
      requests: 900,
      previousPeriodRequests: 450,
    },
    {
      id: 'rtl-2',
      name: 'روبوت البحث',
      requests: 120,
      previousPeriodRequests: 90,
    },
  ],
};

type Fixture =
  | { readonly kind: 'data'; readonly data: AiCrawlerAnalyticsResponse }
  | { readonly kind: 'offline' };

function createClient(fixture: Fixture): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (fixture.kind === 'data') {
    const queryKey = queryKeys.dashboard.aiCrawlers();
    client.setQueryDefaults(queryKey, { enabled: false, staleTime: Infinity });
    client.setQueryData(queryKey, fixture.data);
  }
  return client;
}

function offlineFetch(originalFetch: typeof fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/api/dashboard/ai-crawlers'))
      return originalFetch(input, init);
    return Promise.reject(new TypeError('Failed to fetch'));
  }) as typeof fetch;
}

function AiCrawlerStateHarness({
  fixture,
  dir,
}: {
  readonly fixture: Fixture;
  readonly dir?: 'rtl';
}) {
  const client = React.useMemo(() => createClient(fixture), [fixture]);
  const [ready, setReady] = React.useState(fixture.kind === 'data');

  React.useLayoutEffect(() => {
    if (fixture.kind !== 'offline') return;
    const originalFetch = globalThis.fetch;
    const storyFetch = offlineFetch(originalFetch);
    globalThis.fetch = storyFetch;
    setReady(true);
    return () => {
      if (globalThis.fetch === storyFetch) globalThis.fetch = originalFetch;
    };
  }, [fixture]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={client}>
      <div
        dir={dir}
        className='min-h-screen w-96 overflow-hidden bg-base text-primary-token'
      >
        <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/AI Crawler/AiCrawlerDetailPanel/States',
  component: AiCrawlerDetailPanel,
  parameters: { layout: 'fullscreen' },
  args: { isOpen: true, onClose: () => undefined },
} satisfies Meta<typeof AiCrawlerDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const EMPTY_FIXTURE: Fixture = { kind: 'data', data: zeroAnalytics };
const LONG_FIXTURE: Fixture = { kind: 'data', data: longAnalytics };
const TEASER_FIXTURE: Fixture = { kind: 'data', data: teaserAnalytics };
const RTL_FIXTURE: Fixture = { kind: 'data', data: rtlAnalytics };
const OFFLINE_FIXTURE: Fixture = { kind: 'offline' };

function renderEmpty() {
  return <AiCrawlerStateHarness fixture={EMPTY_FIXTURE} />;
}
function renderLong() {
  return <AiCrawlerStateHarness fixture={LONG_FIXTURE} />;
}
function renderOffline() {
  return <AiCrawlerStateHarness fixture={OFFLINE_FIXTURE} />;
}
function renderPermissionDenied() {
  return <AiCrawlerStateHarness fixture={TEASER_FIXTURE} />;
}
function renderRtl() {
  return <AiCrawlerStateHarness fixture={RTL_FIXTURE} dir='rtl' />;
}

/** Empty: a Pro account with no crawler reads yet. */
export const EmptyNoReads: Story = { render: renderEmpty };

/** Long content: six crawlers, one with a very long name, and large counts. */
export const LongContentManyCrawlers: Story = { render: renderLong };

/** Offline: the analytics request fails, so reads stay Unknown. */
export const OfflineTelemetryUnavailable: Story = { render: renderOffline };

/** Permission denied: a free plan sees the blurred teaser and upgrade call. */
export const PermissionDeniedFreeTeaser: Story = {
  render: renderPermissionDenied,
};

/** Right-to-left: Arabic crawler names in a right-to-left document. */
export const RtlArabicCrawlers: Story = { render: renderRtl };
