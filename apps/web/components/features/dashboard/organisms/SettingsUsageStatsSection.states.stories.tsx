import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLayoutEffect, useState } from 'react';
import { expect, within } from 'storybook/test';
import { queryKeys } from '@/lib/queries/keys';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { SettingsUsageStatsSection } from './SettingsUsageStatsSection';

const baseUsage: ChatUsageData = {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
};

function UsageStoryProvider({
  children,
  usage,
  mode = 'ready',
}: Readonly<{
  children: ReactNode;
  usage: ChatUsageData;
  mode?: 'ready' | 'error' | 'failed-retry' | 'loading' | 'offline';
}>) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
          refetchOnMount: false,
          retryOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    if (mode === 'error' || mode === 'failed-retry') {
      client
        .getQueryCache()
        .build(client, { queryKey: queryKeys.chat.usage() })
        .setState({
          data: undefined,
          error: new Error('Usage unavailable'),
          status: 'error',
          fetchStatus: 'idle',
        });
    } else if (mode === 'offline') {
      // A cached snapshot whose latest refetch failed: the last known balance.
      client
        .getQueryCache()
        .build(client, { queryKey: queryKeys.chat.usage() })
        .setState({
          data: usage,
          error: new Error('Failed to fetch'),
          status: 'error',
          fetchStatus: 'idle',
        });
    } else if (mode === 'ready') {
      client.setQueryData(queryKeys.chat.usage(), usage);
    }
    return client;
  });

  useLayoutEffect(() => {
    const mockWindow = window as Window & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request => {
      if (request.url.pathname !== '/api/chat/usage')
        return previous?.(request);
      if (mode === 'loading') return new Promise<Response>(() => undefined);
      if (mode === 'offline')
        return Promise.reject(new TypeError('Failed to fetch'));
      if (mode === 'failed-retry')
        return Response.json({ error: 'Usage unavailable' }, { status: 503 });
      return Response.json(usage);
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  }, [mode, usage]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className='mx-auto w-full max-w-3xl p-6'>{children}</div>
    </QueryClientProvider>
  );
}

/** State coverage for the weekly AI message usage panel; same query seeding as the base stories. */
const meta = {
  title: 'Features/Dashboard/Organisms/SettingsUsageStatsSection States',
  component: SettingsUsageStatsSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SettingsUsageStatsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no messages used this week. */
export const EmptyNoMessages: Story = {
  render: function EmptyNoMessagesStory() {
    return (
      <UsageStoryProvider usage={{ ...baseUsage, used: 0, remaining: 70 }}>
        <SettingsUsageStatsSection />
      </UsageStoryProvider>
    );
  },
};

/** Partial: a stale snapshot shows the last known balance with a retry. */
export const PartialStaleSnapshot: Story = {
  render: function PartialStaleSnapshotStory() {
    return (
      <UsageStoryProvider usage={{ ...baseUsage, _stale: true }}>
        <SettingsUsageStatsSection />
      </UsageStoryProvider>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Usage may be out of date.')
    ).toBeVisible();
  },
};

/** Long content: very large weekly limits and counts. */
export const LongContentLargeCounts: Story = {
  render: function LongContentLargeCountsStory() {
    return (
      <UsageStoryProvider
        usage={{
          ...baseUsage,
          plan: 'max',
          weeklyLimit: 1_000_000,
          used: 987_654,
          remaining: 12_346,
          warningThreshold: 200_000,
          isNearLimit: true,
        }}
      >
        <SettingsUsageStatsSection />
      </UsageStoryProvider>
    );
  },
};

/** Offline: the refetch could not reach the network, so the cached balance is marked out of date. */
export const OfflineLastKnown: Story = {
  render: function OfflineLastKnownStory() {
    return (
      <UsageStoryProvider usage={baseUsage} mode='offline'>
        <SettingsUsageStatsSection />
      </UsageStoryProvider>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Last Known Weekly Messages')
    ).toBeVisible();
  },
};

/** Permission denied: a free plan that used every message sees the upgrade call to action. */
export const PermissionDeniedExhaustedFree: Story = {
  render: function PermissionDeniedExhaustedFreeStory() {
    return (
      <UsageStoryProvider
        usage={{
          ...baseUsage,
          plan: 'free',
          weeklyLimit: 15,
          used: 15,
          remaining: 0,
          warningThreshold: 3,
          isExhausted: true,
        }}
      >
        <SettingsUsageStatsSection />
      </UsageStoryProvider>
    );
  },
};

/** Right-to-left: the usage panel inside an RTL document. */
export const RtlDocument: Story = {
  render: function RtlDocumentStory() {
    return (
      <div dir='rtl'>
        <UsageStoryProvider usage={baseUsage}>
          <SettingsUsageStatsSection />
        </UsageStoryProvider>
      </div>
    );
  },
};
