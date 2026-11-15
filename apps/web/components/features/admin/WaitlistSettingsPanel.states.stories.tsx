import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { WaitlistSettingsResponse } from '@/lib/queries';
import { WaitlistSettingsPanel } from './WaitlistSettingsPanel';

type SettingsRespond = () => Promise<Response>;

const SETTINGS: WaitlistSettingsResponse = {
  gateEnabled: true,
  autoAcceptEnabled: true,
  autoAcceptAfterDays: 7,
  autoAcceptDailyLimit: 25,
  autoAcceptedToday: 3,
  autoAcceptResetsAt: '2026-09-02T00:00:00.000Z',
};

function settingsResponse(settings: WaitlistSettingsResponse) {
  return Promise.resolve(
    new Response(JSON.stringify({ settings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

/**
 * Answers the waitlist settings route for one story with a fresh query
 * client, and restores the real fetch when the story unmounts.
 */
function SettingsRouteFixture({
  respond,
  children,
}: Readonly<{ respond: SettingsRespond; children: ReactNode }>) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  );
  const [restore] = useState(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(APP_ROUTES.ADMIN_WAITLIST_SETTINGS)) return respond();
      return original(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  });
  useEffect(() => restore, [restore]);
  return (
    <QueryClientProvider client={client}>
      <div className='max-w-2xl'>{children}</div>
    </QueryClientProvider>
  );
}

function withSettingsRoute(respond: SettingsRespond) {
  return [
    function WithSettingsRouteDecorator(Story: () => ReactNode) {
      return (
        <SettingsRouteFixture respond={respond}>
          <Story />
        </SettingsRouteFixture>
      );
    },
  ];
}

/** Rendered states of the waitlist settings panel beyond its default stories. */
const meta = {
  title: 'Admin/Waitlist/WaitlistSettingsPanel/States',
  component: WaitlistSettingsPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WaitlistSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the settings route failed, so the panel says it could not load. */
export const ErrorLoadFailed: Story = {
  decorators: withSettingsRoute(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'Settings store unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  ),
};

/** Offline: the request never reached the server. */
export const OfflineLoad: Story = {
  decorators: withSettingsRoute(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
};

/** Long content: the largest limits and a five-digit approval count. */
export const LongContentLimits: Story = {
  decorators: withSettingsRoute(() =>
    settingsResponse({
      ...SETTINGS,
      autoAcceptAfterDays: 365,
      autoAcceptDailyLimit: 10_000,
      autoAcceptedToday: 9_999,
    })
  ),
};

/** Right-to-left: the loaded panel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    ...withSettingsRoute(() => settingsResponse(SETTINGS)),
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
