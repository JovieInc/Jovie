import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import type { WhatShippedResponse } from '@/lib/hud/what-shipped';
import { WhatShipped } from './WhatShipped';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the what-shipped route the way a story asks; returns a restore. */
function stubWhatShipped(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/ops/what-shipped'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const item = (number: number, title: string) => ({
  number,
  title,
  merged_at: '2026-09-05T14:45:00.000Z',
  url: `https://github.com/JovieInc/Jovie/pull/${number}`,
});

const response = (
  overrides: Partial<WhatShippedResponse> = {}
): WhatShippedResponse => ({
  generatedAt: '2026-09-05T14:50:00.000Z',
  available: true,
  observation: 'ok',
  errorMessage: null,
  items: [
    item(17279, 'Keep Symphony workers alive through routing preflight'),
    item(17277, 'Observe closure health without pausing remediation'),
  ],
  ...overrides,
});

function StoryShell({
  seed,
  children,
}: {
  readonly seed?: WhatShippedResponse;
  readonly children: ReactElement;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seed) client.setQueryData(['ops', 'what-shipped', null], seed);
  return (
    <QueryClientProvider client={client}>
      <div className='w-full max-w-lg bg-base p-4 text-primary-token'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

/** State coverage for the cockpit "What's New" card; RecentMerges lives in WhatShipped.stories.tsx. */
const meta = {
  title: 'Features/Admin/WhatShipped States',
  component: WhatShipped,
  parameters: { layout: 'centered' },
  decorators: [
    (Story, { parameters }) => (
      <StoryShell seed={parameters.whatShippedSeed as WhatShippedResponse}>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof WhatShipped>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first read is in flight, so two skeleton rows hold the space. */
export const LoadingFirstRead: Story = {
  beforeEach: () => stubWhatShipped(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('what-shipped-observation')
    ).toBeNull();
  },
};

/** Empty: the feed answered and nothing merged in the window. */
export const EmptyNothingShipped: Story = {
  parameters: { whatShippedSeed: response({ items: [] }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Nothing shipped in the last few hours.')
    ).toBeVisible();
  },
};

/** Error: the first read failed, so the card offers a retry instead of rows. */
export const ErrorFeedUnavailable: Story = {
  beforeEach: () =>
    stubWhatShipped(async () => Response.json({}, { status: 503 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('What shipped is unavailable.')
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** Partial: the feed is unavailable, so the last known rows show with a notice. */
export const PartialLastKnownRows: Story = {
  parameters: {
    whatShippedSeed: response({
      observation: 'unavailable',
      available: false,
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Showing last known shipped PRs.')
    ).toBeVisible();
  },
};

/** Long content: many merges with long titles truncate on one line each. */
export const LongContentManyLongTitles: Story = {
  parameters: {
    whatShippedSeed: response({
      items: Array.from({ length: 8 }, (_, i) =>
        item(
          17_300 + i,
          `Route every release-day page, pre-save confirmation and playlist pitch through the shared certification pipeline, part ${i + 1}`
        )
      ),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('link')).toHaveLength(8);
  },
};

/** Offline: the first read never reached the server. */
export const OfflineNetworkFailure: Story = {
  beforeEach: () =>
    stubWhatShipped(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('What shipped is unavailable.')
    ).toBeVisible();
  },
};

/** Right-to-left: the card and its rows inside an RTL document. */
export const RtlDocument: Story = {
  parameters: { whatShippedSeed: response() },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('link')).toHaveLength(2);
  },
};
