import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLayoutEffect, useState } from 'react';
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
  mode?: 'ready' | 'error' | 'failed-retry' | 'loading';
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

const meta = {
  title: 'Features/Dashboard/Organisms/SettingsUsageStatsSection',
  component: SettingsUsageStatsSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SettingsUsageStatsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  render: () => (
    <UsageStoryProvider usage={baseUsage}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const NearLimit: Story = {
  render: () => (
    <UsageStoryProvider
      usage={{
        ...baseUsage,
        used: 58,
        remaining: 12,
        isNearLimit: true,
      }}
    >
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const HealthyLight: Story = {
  ...Healthy,
  parameters: { themes: { themeOverride: 'light' } },
};

export const Exhausted: Story = {
  render: () => (
    <UsageStoryProvider
      usage={{ ...baseUsage, used: 70, remaining: 0, isExhausted: true }}
    >
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const Stale: Story = {
  render: () => (
    <UsageStoryProvider usage={{ ...baseUsage, _stale: true }}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const RecoverableError: Story = {
  render: () => (
    <UsageStoryProvider usage={baseUsage} mode='error'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const RecoverableErrorLight: Story = {
  ...RecoverableError,
  parameters: { themes: { themeOverride: 'light' } },
};

export const Loading: Story = {
  render: () => (
    <UsageStoryProvider usage={baseUsage} mode='loading'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};

export const FailedRetry: Story = {
  render: () => (
    <UsageStoryProvider usage={baseUsage} mode='failed-retry'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
  ),
};
