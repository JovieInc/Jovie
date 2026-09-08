import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
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
}: Readonly<{
  children: ReactNode;
  usage: ChatUsageData;
}>) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    client.setQueryData(queryKeys.chat.usage(), usage);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-full max-w-3xl p-6'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/Organisms/SettingsUsageStatsSection',
  component: SettingsUsageStatsSection,
  parameters: {
    layout: 'centered',
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
