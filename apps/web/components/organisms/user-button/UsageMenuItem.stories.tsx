import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from '@/lib/queries/keys';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { UsageMenuItem } from './UsageMenuItem';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
  },
});

queryClient.setQueryData(queryKeys.chat.usage(), {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
});

const meta: Meta<typeof UsageMenuItem> = {
  title: 'Organisms/UserButton/UsageMenuItem',
  component: UsageMenuItem,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Compact plan-usage disclosure used inside the signed-in user dropdown.',
      },
    },
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    usageStatsUrl: APP_ROUTES.SETTINGS_USAGE,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /usage remaining/i })
    );
  },
};

const HEALTHY_PRO: ChatUsageData = {
  plan: 'pro',
  weeklyLimit: 70,
  used: 20,
  remaining: 50,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 14,
  isNearLimit: false,
};

const NEAR_LIMIT_FREE: ChatUsageData = {
  plan: 'free',
  weeklyLimit: 15,
  used: 14,
  remaining: 1,
  resetAt: '2026-08-24T18:00:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: true,
};

/** How the story's local /api/chat/usage endpoint answers. */
type UsageReply = 'pending' | 'server-error' | 'offline';

/**
 * Gives a story its own query cache, optionally seeded, and a local usage
 * endpoint. Stories never reach /api/chat/usage: fetch is replaced for the
 * life of the story and restored on unmount, and any other request throws.
 * `refreshOnMount` starts one background refresh, the way the menu refreshes
 * a cached balance, so a failing endpoint shows the cached-snapshot state.
 */
function LocalUsageApi({
  seed,
  reply,
  refreshOnMount = false,
  children,
}: {
  readonly seed?: ChatUsageData;
  readonly reply: UsageReply;
  readonly refreshOnMount?: boolean;
  readonly children: ReactNode;
}) {
  const [client] = useState(() => {
    const next = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (seed) next.setQueryData(queryKeys.chat.usage(), seed);
    return next;
  });

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      if (!String(input).includes('/api/chat/usage')) {
        throw new Error('Unexpected network request in UsageMenuItem story.');
      }
      if (reply === 'pending') return new Promise<Response>(() => undefined);
      if (reply === 'offline') throw new TypeError('Failed to fetch');
      return new Response(
        JSON.stringify({ error: 'Stories never read usage.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [reply]);

  useEffect(() => {
    if (!refreshOnMount) return;
    void client.refetchQueries({ queryKey: queryKeys.chat.usage() });
  }, [client, refreshOnMount]);

  // The meta decorator already draws the menu surface; this provider sits
  // inside it and shadows the shared seeded cache for this story only.
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const withUsage = (props: {
  readonly seed?: ChatUsageData;
  readonly reply: UsageReply;
  readonly refreshOnMount?: boolean;
}): Decorator => {
  function WithUsage(Story: Parameters<Decorator>[0]) {
    return (
      <LocalUsageApi {...props}>
        <Story />
      </LocalUsageApi>
    );
  }
  return WithUsage;
};

async function expandUsage(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('button', { name: /usage remaining/i })
  );
  return canvas;
}

export const LoadingUsage: Story = {
  decorators: [withUsage({ reply: 'pending' })],
  play: async ({ canvasElement }) => {
    const canvas = await expandUsage(canvasElement);
    await expect(await canvas.findByText('Loading usage…')).toBeVisible();
  },
};

export const ErrorUsageUnavailable: Story = {
  decorators: [withUsage({ reply: 'server-error' })],
  play: async ({ canvasElement }) => {
    const canvas = await expandUsage(canvasElement);
    await expect(
      await canvas.findByText(
        'Usage details are unavailable right now.',
        {},
        { timeout: 5000 }
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Retry Usage' })
    ).toBeVisible();
  },
};

export const OfflineCachedUsage: Story = {
  decorators: [
    withUsage({ seed: HEALTHY_PRO, reply: 'offline', refreshOnMount: true }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('71% (cached)', {}, { timeout: 5000 });
    await expandUsage(canvasElement);
    await expect(canvas.getByText('Usage may be out of date')).toBeVisible();
    await expect(canvas.getByText('Last Known Weekly Messages')).toBeVisible();
  },
};

export const EmptyUsageFreshWeek: Story = {
  decorators: [
    withUsage({
      seed: { ...HEALTHY_PRO, used: 0, remaining: 70 },
      reply: 'pending',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await expandUsage(canvasElement);
    await expect(canvas.getByText('0 of 70 used')).toBeVisible();
  },
};

/** The usage payload arrived without a used count, so it cannot be verified. */
export const PartialUnverifiedUsage: Story = {
  decorators: [
    withUsage({
      seed: { ...HEALTHY_PRO, used: undefined } as unknown as ChatUsageData,
      reply: 'pending',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await expandUsage(canvasElement);
    await expect(
      canvas.getByText('Usage details could not be verified.')
    ).toBeVisible();
  },
};

export const LongContentUpgradeLabel: Story = {
  args: {
    onUpgrade: fn(),
    upgradeLabel:
      'Upgrade to Artist Presence for more weekly messages and release drafts',
  },
  decorators: [withUsage({ seed: NEAR_LIMIT_FREE, reply: 'pending' })],
  play: async ({ canvasElement }) => {
    await expandUsage(canvasElement);
  },
};

/** Free plan at its weekly limit: chat is gated until the plan is upgraded. */
export const LockedFreePlanExhausted: Story = {
  args: { onUpgrade: fn() },
  decorators: [
    withUsage({
      seed: {
        ...NEAR_LIMIT_FREE,
        used: 15,
        remaining: 0,
        isExhausted: true,
      },
      reply: 'pending',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await expandUsage(canvasElement);
    await expect(
      canvas.getByRole('button', { name: /upgrade to artist presence/i })
    ).toBeEnabled();
  },
};

export const RtlExpanded: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
    withUsage({ seed: NEAR_LIMIT_FREE, reply: 'pending' }),
  ],
  args: { onUpgrade: fn(), upgradeLabel: 'الترقية للحصول على المزيد' },
  play: async ({ canvasElement }) => {
    await expandUsage(canvasElement);
  },
};
