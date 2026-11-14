import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { OutreachOverviewPanel } from './OutreachOverviewPanel';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

/** Answers the outreach queue request through the preview per-story hook. */
function stubOutreach(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/admin/outreach'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const pending = () => new Promise<Response>(() => {});
const serverError = () => Promise.resolve(new Response('{}', { status: 500 }));
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
function respondWith(body: unknown) {
  return () => Promise.resolve(Response.json(body));
}

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

const LOAD_ERROR =
  'We could not load outreach counts right now. Please try again shortly.';

/** State coverage for the outreach overview, driven by the counts request. */
const meta = {
  title: 'Features/Admin/Outreach/OutreachOverviewPanel States',
  component: OutreachOverviewPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OutreachOverviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the counts request is in flight; skeleton cards hold the layout. */
export const LoadingCounts: Story = {
  beforeEach: () => stubOutreach(pending),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Outreach Pipeline')).toBeNull();
  },
};

/** Empty: every queue is at zero. */
export const EmptyQueues: Story = {
  beforeEach: () =>
    stubOutreach(
      respondWith({ counts: { email: 0, dm: 0, manualReview: 0, total: 0 } })
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('0 total')).toBeVisible();
  },
};

/** Error: the server fails the request; zero counts sit under the reason. */
export const ErrorCountsUnavailable: Story = {
  beforeEach: () => stubOutreach(serverError),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LOAD_ERROR)).toBeVisible();
    await expect(canvas.getByText('0 total')).toBeVisible();
  },
};

/** Offline: the request never reaches the server; the same reason shows. */
export const OfflineCountsUnavailable: Story = {
  beforeEach: () => stubOutreach(offline),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LOAD_ERROR)).toBeVisible();
  },
};

/** Partial: only some queues are reported; the total is summed from them. */
export const PartialCounts: Story = {
  beforeEach: () => stubOutreach(respondWith({ counts: { email: 24 } })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('24 total')).toBeVisible();
  },
};

/** Long content: seven-digit counts stay inside their cards. */
export const LongContentCounts: Story = {
  beforeEach: () =>
    stubOutreach(
      respondWith({
        counts: {
          email: 1_204_388,
          dm: 987_654,
          manualReview: 345_678,
          total: 2_537_720,
        },
      })
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('2537720 total')).toBeVisible();
  },
};

/** Right-to-left: the header and metric cards inside an RTL document. */
export const RtlCounts: Story = {
  decorators: [RtlDecorator],
  beforeEach: () =>
    stubOutreach(
      respondWith({ counts: { email: 24, dm: 9, manualReview: 3, total: 36 } })
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('36 total')).toBeVisible();
  },
};
