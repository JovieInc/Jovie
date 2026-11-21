import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutreachOverviewPanel } from './OutreachOverviewPanel';

/** Stub the one counts route so a story never leaves the browser. */
function stubCounts(respond: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => respond();
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

const meta = {
  title: 'Features/Admin/Outreach/OutreachOverviewPanel/States',
  component: OutreachOverviewPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OutreachOverviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the counts request never settles, so the skeleton holds. */
export const LoadingSkeleton: Story = {
  beforeEach: () => stubCounts(() => new Promise<Response>(() => undefined)),
};

/** Empty: every queue is at zero. */
export const EmptyQueues: Story = {
  beforeEach: () =>
    stubCounts(() =>
      json({ counts: { email: 0, dm: 0, manualReview: 0, total: 0 } })
    ),
};

/** Error: the counts route answers 500. */
export const ErrorCountsFailed: Story = {
  beforeEach: () => stubCounts(() => json({}, 500)),
};

/** Partial: the response omits the total, so it is derived from the queues. */
export const PartialMissingTotal: Story = {
  beforeEach: () => stubCounts(() => json({ counts: { email: 4, dm: 2 } })),
};

/** Long content: five-digit counts in every tile. */
export const LongContentLargeCounts: Story = {
  args: { embedded: true },
  beforeEach: () =>
    stubCounts(() =>
      json({
        counts: { email: 12480, dm: 9031, manualReview: 1203, total: 22714 },
      })
    ),
};

/** Offline: the network request rejects. */
export const OfflineNetworkRejects: Story = {
  beforeEach: () =>
    stubCounts(() => Promise.reject(new TypeError('Failed to fetch'))),
};

/** Right-to-left: the loaded panel inside an RTL document. */
export const RtlLoaded: Story = {
  beforeEach: () =>
    stubCounts(() =>
      json({ counts: { email: 24, dm: 9, manualReview: 3, total: 36 } })
    ),
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
