import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { EmailQueuePanel } from './EmailQueuePanel';

/**
 * Rendered states of the email queue. Each story answers the panel's two
 * reads (the queue page and the campaign setting) and restores fetch after.
 */
const meta = {
  title: 'Features/Admin/Outreach/EmailQueuePanel/States',
  component: EmailQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EmailQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

interface Lead {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  priorityScore: number | null;
  fitScore: number | null;
  outreachStatus: string;
  outreachQueuedAt: string | null;
}

function lead(index: number, overrides: Partial<Lead> = {}): Lead {
  return {
    id: `lead-${index}`,
    displayName: `Ari Lane ${index}`,
    contactEmail: `ari${index}@example.com`,
    priorityScore: 90 - index,
    fitScore: 80 - index,
    outreachStatus: 'pending',
    outreachQueuedAt: null,
    ...overrides,
  };
}

function serveQueue(queue: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/api/admin/outreach/settings')) {
        return Promise.resolve(Response.json({ campaignsEnabled: true }));
      }
      return queue();
    };
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

function page(items: Lead[], pendingTotal = items.length) {
  return async () =>
    Response.json({
      items,
      total: items.length,
      pendingTotal,
      page: 1,
      limit: 50,
    });
}

/** Loading: the queue page has not arrived, so the table shows its skeleton. */
export const LoadingQueue: Story = {
  beforeEach: serveQueue(() => new Promise<Response>(() => undefined)),
};

/** Empty: no lead is queued for email right now. */
export const EmptyQueue: Story = {
  beforeEach: serveQueue(page([], 0)),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('No email leads')
    ).toBeInTheDocument();
  },
};

/** Error: the queue endpoint answers with a server error. */
export const ErrorLoadingQueue: Story = {
  beforeEach: serveQueue(async () =>
    Response.json({ error: 'boom' }, { status: 500 })
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Unable to load email queue')
    ).toBeInTheDocument();
  },
};

/** Offline: the queue request never reaches the server. */
export const OfflineQueue: Story = {
  beforeEach: serveQueue(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Unable to load email queue')
    ).toBeInTheDocument();
  },
};

/** Partial: leads missing a name, email or scores show their placeholders. */
export const PartialLeads: Story = {
  beforeEach: serveQueue(
    page([
      lead(1, {
        displayName: null,
        contactEmail: null,
        priorityScore: null,
        fitScore: null,
      }),
      lead(2, { outreachQueuedAt: '2026-10-01T15:00:00.000Z' }),
    ])
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Unknown creator')
    ).toBeInTheDocument();
  },
};

/** Long content: a full page of leads with long names and emails. */
export const LongContentLeads: Story = {
  beforeEach: serveQueue(
    page(
      Array.from({ length: 50 }, (_, index) =>
        lead(index + 1, {
          displayName: `Alexandria Montgomery-Wellington and the Midnight Orchestra ${index + 1}`,
          contactEmail: `alexandria.montgomery.${index + 1}@an-unusually-long-label-domain.example.com`,
        })
      ),
      1240
    )
  ),
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic lead names in a right-to-left admin page. */
export const RtlLeads: Story = {
  decorators: [withRtl],
  beforeEach: serveQueue(
    page([
      lead(1, { displayName: 'ليلى حسن' }),
      lead(2, { displayName: 'عمر خالد' }),
    ])
  ),
};
