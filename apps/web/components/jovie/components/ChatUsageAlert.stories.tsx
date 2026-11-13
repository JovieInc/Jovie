import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { ChatUsageData } from '@/lib/queries';
import { queryKeys } from '@/lib/queries/keys';
import { ChatUsageAlert } from './ChatUsageAlert';

const nearLimitFree: ChatUsageData = {
  plan: 'free',
  used: 14,
  remaining: 1,
  weeklyLimit: 15,
  warningThreshold: 3,
  isNearLimit: true,
  isExhausted: false,
};

/**
 * Seeds the chat usage query for one story. `undefined` leaves the first read
 * in flight forever, which is the loading frame.
 */
function UsageQuery({
  usage,
  children,
}: {
  readonly usage: ChatUsageData | undefined;
  readonly children: ReactNode;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (usage) queryClient.setQueryData(queryKeys.chat.usage(), usage);
    else
      void queryClient.prefetchQuery({
        queryKey: queryKeys.chat.usage(),
        queryFn: () => new Promise<ChatUsageData>(() => {}),
      });
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withUsage(usage: ChatUsageData | undefined, width = 'w-120') {
  return function UsageDecorator(Story: () => ReactNode) {
    return (
      <UsageQuery usage={usage}>
        <div className={width}>
          <Story />
        </div>
      </UsageQuery>
    );
  };
}

const meta = {
  title: 'Jovie/Components/ChatUsageAlert',
  component: ChatUsageAlert,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatUsageAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A free plan with one message left this week. */
export const Default: Story = {
  decorators: [withUsage(nearLimitFree)],
};

/** A paid plan near its limit points to plans instead of an upgrade. */
export const NearLimitPaidPlan: Story = {
  decorators: [
    withUsage({ ...nearLimitFree, plan: 'pro', used: 97, weeklyLimit: 100 }),
  ],
};

/** The first usage read is in flight: no notice is drawn and no space is held. */
export const LoadingFirstRead: Story = {
  decorators: [withUsage(undefined)],
};

/** Healthy usage: there is nothing to warn about, so nothing renders. */
export const EmptyHealthyUsage: Story = {
  decorators: [
    withUsage({
      ...nearLimitFree,
      used: 2,
      remaining: 13,
      isNearLimit: false,
    }),
  ],
};

/** The free allowance is used up: sending is blocked until an upgrade. */
export const PermissionDeniedExhausted: Story = {
  decorators: [
    withUsage({
      ...nearLimitFree,
      used: 15,
      remaining: 0,
      isExhausted: true,
    }),
  ],
};

/** Offline after a read: the last observed usage stays on screen. */
export const OfflineLastKnownUsage: Story = {
  decorators: [withUsage({ ...nearLimitFree, _stale: true })],
};

/** Large allowances at phone width: the copy and action wrap. */
export const LongContentPhoneWidth: Story = {
  decorators: [
    withUsage(
      {
        ...nearLimitFree,
        plan: 'max',
        used: 99_870,
        remaining: 130,
        weeklyLimit: 100_000,
        warningThreshold: 500,
      },
      'w-80'
    ),
  ],
};

/** Right to left: the notice row mirrors with the document direction. */
export const RtlLayout: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
    withUsage(nearLimitFree),
  ],
};
