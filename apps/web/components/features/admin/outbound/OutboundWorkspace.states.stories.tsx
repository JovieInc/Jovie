import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { OutboundReadiness } from '@/lib/outbound/readiness';
import type { OutboundQueue } from '@/lib/outbound/types';
import { queryKeys } from '@/lib/queries/keys';
import { OutboundWorkspace } from './OutboundWorkspace';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

/** Answers the outbound admin API through the preview's per-story hook. */
function stubOutboundApi(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname.startsWith('/api/admin/outbound')
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const readiness: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 2,
  items: [
    {
      id: 'certifications',
      label: 'Certifications cleared',
      status: 'green',
      detail: 'No people waiting on fact review',
      owner: 'outbound',
      href: null,
    },
    {
      id: 'cone',
      label: 'Revenue cone: acquisition eligible',
      status: 'red',
      detail: '1 of 8 receipts not green',
      owner: 'revenue',
      href: null,
    },
  ],
};

/**
 * Seeds only the queries a state needs. Anything left unseeded reaches the
 * Storybook API stub, which answers 503 unless the story overrides it.
 */
function withOutbound(
  seed: {
    readonly queue?: OutboundQueue;
    readonly readiness?: OutboundReadiness;
  },
  dir?: 'rtl'
) {
  return function OutboundStateDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (seed.queue) {
      client.setQueryData(queryKeys.admin.outbound(), seed.queue);
    }
    if (seed.readiness) {
      client.setQueryData(queryKeys.admin.outboundReadiness(), seed.readiness);
    }
    return (
      <QueryClientProvider client={client}>
        <RightPanelProvider>
          <div className='h-screen bg-base text-primary-token' dir={dir}>
            <Story />
          </div>
        </RightPanelProvider>
      </QueryClientProvider>
    );
  };
}

const ADA = outboundFixtureRow();

const meta: Meta<typeof OutboundWorkspace> = {
  title: 'Admin/Outbound/Workspace States',
  component: OutboundWorkspace,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the queue request is in flight; headers stay over skeleton rows. */
export const LoadingQueue: Story = {
  decorators: [withOutbound({})],
  beforeEach: () => stubOutboundApi(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('columnheader').length).toBeGreaterThan(0);
    await expect(canvas.queryByText('Outbound queue unavailable')).toBeNull();
  },
};

/** Error: the server fails the queue request and the table offers a retry. */
export const ErrorQueueUnavailable: Story = {
  decorators: [withOutbound({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Outbound queue unavailable', undefined, {
        timeout: 4_000,
      })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** Offline: the request never reaches the server; the same retry is offered. */
export const OfflineQueueUnavailable: Story = {
  decorators: [withOutbound({})],
  beforeEach: () =>
    stubOutboundApi(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Outbound queue unavailable', undefined, {
        timeout: 4_000,
      })
    ).toBeVisible();
  },
};

/** Partial: the queue loaded but readiness did not, so its count stays blank. */
export const PartialReadinessMissing: Story = {
  decorators: [withOutbound({ queue: outboundFixtureQueue([ADA]) })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ada')).toBeVisible();
    await expect(
      canvas.getByTestId('outbound-readiness-toggle')
    ).toHaveTextContent(/^Readiness\s*$/);
  },
};

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

/** Long content: a long name, handle, trigger and notes stay on one row. */
export const LongContentRow: Story = {
  decorators: [
    withOutbound({
      queue: outboundFixtureQueue([
        outboundFixtureRow({
          name: LONG_NAME,
          handle: 'aurelia-montgomery-fitzgerald-official-account',
          whyNow:
            'Released a deluxe anniversary edition with twelve bonus tracks 3 days ago',
          relationshipNotes: [
            "Relationship: Armada Music, Tim's vocalist deals across the last three release cycles",
          ],
        }),
      ]),
      readiness,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_NAME)).toBeVisible();
  },
};

/** Right-to-left: the toolbar, table and shortcut line in an RTL document. */
export const RtlQueue: Story = {
  decorators: [
    withOutbound(
      {
        queue: outboundFixtureQueue([
          outboundFixtureRow({
            name: 'ليلى الحسن',
            handle: 'layla',
            whyNow: 'أصدرت أغنية قبل ٥ أيام',
          }),
        ]),
        readiness,
      },
      'rtl'
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('ليلى الحسن')).toBeVisible();
    await expect(
      canvas.getByRole('toolbar', { name: 'Outbound Views' })
    ).toBeVisible();
  },
};
