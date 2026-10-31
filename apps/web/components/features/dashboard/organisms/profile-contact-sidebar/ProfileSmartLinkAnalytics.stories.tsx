import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import { ProfileSmartLinkAnalytics } from './ProfileSmartLinkAnalytics';

type AnalyticsData = {
  profile_views: number;
  total_clicks: number;
};

function analyticsStoryShell({
  data,
  fail,
  children,
}: {
  data?: AnalyticsData;
  fail?: boolean;
  children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });
  if (data) {
    queryClient.setQueryData(queryKeys.dashboard.analytics('30d'), data);
  } else if (fail) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard.analytics('30d'),
      queryFn: () => Promise.reject(new Error('story offline')),
    });
  } else {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard.analytics('30d'),
      queryFn: () => new Promise<AnalyticsData>(() => {}),
    });
  }
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/ProfileSmartLinkAnalytics',
  component: ProfileSmartLinkAnalytics,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileUrl: 'https://jov.ie/adele',
  },
} satisfies Meta<typeof ProfileSmartLinkAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story =>
      analyticsStoryShell({
        data: { profile_views: 1284, total_clicks: 96 },
        children: <Story />,
      }),
  ],
};

export const Loading: Story = {
  decorators: [
    Story =>
      analyticsStoryShell({
        children: <Story />,
      }),
  ],
};

export const LoadError: Story = {
  decorators: [
    Story =>
      analyticsStoryShell({
        fail: true,
        children: <Story />,
      }),
  ],
};
