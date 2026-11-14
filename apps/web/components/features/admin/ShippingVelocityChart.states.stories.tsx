import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ShippingVelocityChart } from './ShippingVelocityChart';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the shipping-velocity route the way a story asks; returns a restore. */
function stubVelocity(respond: (url: URL) => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/admin/hud/shipping-velocity'
      ? respond(request.url)
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

const day = (index: number, scale = 1) => {
  const date = new Date(Date.UTC(2026, 7, 24 + index));
  return {
    date: date.toISOString().slice(0, 10),
    merged: (21 + (index % 9) * 3) * scale,
    opened: (38 + (index % 7) * 4) * scale,
    closed: (6 + (index % 5)) * scale,
  };
};

const sevenDays = Array.from({ length: 7 }, (_, i) => day(i));

/** State coverage for the HUD shipping velocity chart; the default lives in ShippingVelocityChart.stories.tsx. */
const meta = {
  title: 'Features/Admin/ShippingVelocityChart States',
  component: ShippingVelocityChart,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-3xl rounded-xl border border-subtle bg-surface-1'>
        <Story />
      </div>
    ),
  ],
  args: {
    initialData: sevenDays,
    initialRange: '7d',
    // Fresh at load, so no auto-refresh fires before the play function.
    cachedAt: new Date().toISOString(),
  },
} satisfies Meta<typeof ShippingVelocityChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first read is still in flight, so the chart frame holds a skeleton. */
export const LoadingFirstRead: Story = {
  args: { initialData: undefined, cachedAt: undefined },
  beforeEach: () => stubVelocity(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('shipping-velocity-loading')
    ).toBeVisible();
  },
};

/** Empty: a successful read with no pull requests says so instead of drawing zero. */
export const EmptyNoPullRequests: Story = {
  args: { initialData: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/No Pull Requests in this period/)
    ).toBeVisible();
  },
};

/** Error: the first read failed, so there is no chart and a retry is offered. */
export const ErrorFirstReadFailed: Story = {
  args: { initialData: undefined, cachedAt: undefined },
  beforeEach: () =>
    stubVelocity(async () => Response.json({}, { status: 503 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Failed to fetch (503)')
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** Partial: a 30D refresh failed, so the last known 7D chart stays with a notice. */
export const PartialRetainedAfterRefreshFailure: Story = {
  beforeEach: () =>
    stubVelocity(async () => Response.json({}, { status: 502 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '30D' }));
    await expect(
      await canvas.findByText(
        /Showing last known 7D velocity\. 30D refresh failed/
      )
    ).toBeVisible();
    await expect(canvas.getByTestId('shipping-velocity-figure')).toBeVisible();
  },
};

/** Long content: a full year of daily counts at high volume. */
export const LongContentFullYear: Story = {
  args: {
    initialData: Array.from({ length: 365 }, (_, i) => day(i, 40)),
    initialRange: '1y',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: '1Y' })
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Offline: the first read never reached the server. */
export const OfflineNetworkFailure: Story = {
  args: { initialData: undefined, cachedAt: undefined },
  beforeEach: () =>
    stubVelocity(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Failed to fetch')
    ).toBeVisible();
  },
};

/** Permission denied: the admin route refused the read (403) and nothing is plotted. */
export const PermissionDeniedForbiddenRead: Story = {
  args: { initialData: undefined, cachedAt: undefined },
  beforeEach: () =>
    stubVelocity(async () => Response.json({}, { status: 403 })),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Failed to fetch (403)')
    ).toBeVisible();
  },
};

/** Right-to-left: the chart, legend and range toggle inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Shipping Velocity')
    ).toBeVisible();
  },
};
