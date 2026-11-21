import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HudGithubBudgetPanel, HudShipperNeedPanel } from './HudShipperPanels';
import {
  longShipperPayload,
  rateLimitsPayload,
  shipperPayload,
  unconfiguredRateLimits,
} from './HudShipperPanels.fixtures';

/** Answers the HUD requests for one story; nothing reaches the API. */
function stubHud(answer: (path: string) => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname.startsWith('/api/admin/hud/')) {
        return answer(url.pathname);
      }
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function Panels({ dir = 'ltr' }: Readonly<{ dir?: 'ltr' | 'rtl' }>) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='grid w-full max-w-xl gap-3'>
        <HudShipperNeedPanel source='admin-session' />
        <HudGithubBudgetPanel />
      </div>
    </QueryClientProvider>
  );
}

const pick = (shipper: unknown, limits: unknown) => async (path: string) =>
  Response.json(path.endsWith('shipper') ? shipper : limits);

const meta = {
  title: 'Features/Admin/Hud/HudShipperPanels/States',
  component: Panels,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Panels>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: neither request answers, so both panels hold their spinner. */
export const Loading: Story = {
  beforeEach: stubHud(() => new Promise<Response>(() => {})),
};

/** Empty: nothing in flight and GitHub credentials are not configured. */
export const Empty: Story = {
  beforeEach: stubHud(
    pick(
      { ...shipperPayload, inFlightCount: 0, inFlightJobs: [] },
      unconfiguredRateLimits
    )
  ),
};

/** Error: both requests fail, so each panel offers a retry. */
export const ErrorUnavailable: Story = {
  beforeEach: stubHud(async () => new Response('nope', { status: 500 })),
};

/** Long content: a long last error and a long recent-error log. */
export const LongContent: Story = {
  beforeEach: stubHud(pick(longShipperPayload, rateLimitsPayload)),
};

/** Offline: the network is down, so both requests reject. */
export const Offline: Story = {
  beforeEach: stubHud(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** Rtl: right-to-left layout keeps the panels aligned. */
export const RtlOverflow: Story = {
  beforeEach: stubHud(pick(shipperPayload, rateLimitsPayload)),
  render: () => <Panels dir='rtl' />,
};
