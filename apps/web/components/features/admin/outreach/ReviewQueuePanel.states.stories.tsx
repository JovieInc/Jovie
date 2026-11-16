import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { ReviewQueuePanel } from './ReviewQueuePanel';

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

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    displayName: 'Ada',
    contactEmail: 'ada@example.com',
    instagramHandle: 'ada',
    priorityScore: 82,
    fitScore: 55,
    outreachStatus: 'pending_review',
    signals: { emailSuspicious: true },
    ...overrides,
  };
}

function queue(items: unknown[], total = items.length) {
  return respondWith({ items, total, page: 1, limit: 50 });
}

/** State coverage for the manual review queue, driven by its request. */
const meta = {
  title: 'Features/Admin/Outreach/ReviewQueuePanel States',
  component: ReviewQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReviewQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the queue request is in flight; headers stay over skeleton rows. */
export const LoadingQueue: Story = {
  beforeEach: () => stubOutreach(pending),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Manual review')).toBeVisible();
    await expect(canvas.queryByText('No leads pending')).toBeNull();
  },
};

/** Empty: nothing is waiting for review. */
export const EmptyQueue: Story = {
  beforeEach: () => stubOutreach(queue([])),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No leads pending')).toBeVisible();
  },
};

/** Error: the server fails the request and the table names the failure. */
export const ErrorQueueUnavailable: Story = {
  beforeEach: () => stubOutreach(serverError),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Unable to load manual review')
    ).toBeVisible();
  },
};

/** Offline: the request never reaches the server; the same failure shows. */
export const OfflineQueueUnavailable: Story = {
  beforeEach: () => stubOutreach(offline),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Unable to load manual review')
    ).toBeVisible();
  },
};

/** Partial: a lead with no name, scores, email or handle shows dashes. */
export const PartialLead: Story = {
  beforeEach: () =>
    stubOutreach(
      queue([
        lead({
          displayName: null,
          contactEmail: null,
          instagramHandle: null,
          priorityScore: null,
          fitScore: null,
          signals: {},
        }),
      ])
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Skip' })
    ).toBeVisible();
    await expect(canvas.getAllByText('-').length).toBeGreaterThanOrEqual(5);
  },
};

/** Long content: long values and every signal, with pagination below. */
export const LongContentLeads: Story = {
  beforeEach: () =>
    stubOutreach(
      queue(
        [
          lead({
            displayName: LONG_NAME,
            contactEmail:
              'aurelia.montgomery.fitzgerald.management@extraordinarily-long-label-name.example.com',
            instagramHandle: 'aurelia.montgomery.fitzgerald.official',
            signals: {
              emailSuspicious: true,
              emailInvalid: true,
              hasRepresentation: true,
            },
          }),
          lead({ id: 'lead-2', displayName: 'Bea', instagramHandle: 'bea' }),
        ],
        1280
      )
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LONG_NAME)).toBeVisible();
    await expect(canvas.getByText('1280 queued')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Next Page' })
    ).toBeEnabled();
  },
};

/** Right-to-left: the header and table inside an RTL document. */
export const RtlQueue: Story = {
  decorators: [RtlDecorator],
  beforeEach: () =>
    stubOutreach(
      queue([
        lead({
          displayName: 'ليلى الحسن',
          contactEmail: 'layla@example.com',
          instagramHandle: 'layla',
        }),
      ])
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('ليلى الحسن')).toBeVisible();
  },
};
