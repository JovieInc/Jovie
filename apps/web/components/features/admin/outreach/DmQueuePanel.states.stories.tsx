import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { DmQueuePanel } from './DmQueuePanel';

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

/** State coverage for the DM queue, driven by the queue request's answer. */
const meta = {
  title: 'Features/Admin/Outreach/DmQueuePanel States',
  component: DmQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DmQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the queue request is in flight. */
export const LoadingQueue: Story = {
  beforeEach: () => stubOutreach(pending),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0 queued')).toBeVisible();
    await expect(canvas.queryByText('No leads in DM queue')).toBeNull();
  },
};

/** Empty: the queue loaded with no leads. */
export const EmptyQueue: Story = {
  beforeEach: () => stubOutreach(respondWith({ items: [], total: 0 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No leads in DM queue')).toBeVisible();
  },
};

/** Error: the server fails the request; the panel settles on the empty line. */
export const ErrorLoadFailed: Story = {
  beforeEach: () => stubOutreach(serverError),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No leads in DM queue')).toBeVisible();
  },
};

/** Offline: the request never reaches the server. */
export const OfflineLoadFailed: Story = {
  beforeEach: () => stubOutreach(offline),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No leads in DM queue')).toBeVisible();
  },
};

/** Right-to-left: the header, count and empty line in an RTL document. */
export const RtlQueue: Story = {
  decorators: [RtlDecorator],
  beforeEach: () => stubOutreach(respondWith({ items: [], total: 0 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No leads in DM queue')).toBeVisible();
    await expect(canvas.getByText('DM queue')).toBeVisible();
  },
};
