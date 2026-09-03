import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { queryKeys, type WaitlistSettingsResponse } from '@/lib/queries';
import { WaitlistSettingsPanel } from './WaitlistSettingsPanel';

const defaultSettings: WaitlistSettingsResponse = {
  gateEnabled: true,
  autoAcceptEnabled: true,
  autoAcceptAfterDays: 7,
  autoAcceptDailyLimit: 25,
  autoAcceptedToday: 3,
  autoAcceptResetsAt: '2026-09-02T00:00:00.000Z',
};

function createStoryQueryClient(
  settings: WaitlistSettingsResponse,
  isLoading: boolean
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (!isLoading) {
    client.setQueryData(queryKeys.admin.waitlistSettings(), settings);
  }
  return client;
}

function createWaitlistSettingsFetchMock(
  settings: WaitlistSettingsResponse,
  originalFetch: typeof fetch,
  isLoading: boolean
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes(APP_ROUTES.ADMIN_WAITLIST_SETTINGS)) {
      if (isLoading) {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ settings }), { status: 200 })
      );
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function WaitlistSettingsStory({
  isLoading = false,
  settings = defaultSettings,
}: {
  readonly isLoading?: boolean;
  readonly settings?: WaitlistSettingsResponse;
}) {
  const queryClient = React.useMemo(
    () => createStoryQueryClient(settings, isLoading),
    [isLoading, settings]
  );
  const originalFetchRef = React.useRef<typeof fetch | null>(null);

  React.useLayoutEffect(() => {
    originalFetchRef.current = globalThis.fetch;
    globalThis.fetch = createWaitlistSettingsFetchMock(
      settings,
      globalThis.fetch,
      isLoading
    );
    return () => {
      if (originalFetchRef.current) {
        globalThis.fetch = originalFetchRef.current;
      }
    };
  }, [isLoading, settings]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className='max-w-2xl'>
        <WaitlistSettingsPanel />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Admin/Waitlist/WaitlistSettingsPanel',
  component: WaitlistSettingsPanel,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof WaitlistSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <WaitlistSettingsStory />,
};

export const ManualGateOnly: Story = {
  render: () => (
    <WaitlistSettingsStory
      settings={{
        ...defaultSettings,
        autoAcceptEnabled: false,
        autoAcceptDailyLimit: 0,
        autoAcceptedToday: 0,
      }}
    />
  ),
};

export const Loading: Story = {
  render: () => <WaitlistSettingsStory isLoading />,
};
