import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DmQueuePanel } from './DmQueuePanel';

/** Stub the one queue route so a story never leaves the browser. */
function stubQueue(respond: () => Promise<Response>) {
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

const lead = (id: string, displayName: string, dmCopy: string) => ({
  id,
  displayName,
  instagramHandle: `${id}_handle`,
  priorityScore: 80,
  dmCopy,
  outreachStatus: 'queued',
});

const meta = {
  title: 'Features/Admin/Outreach/DmQueuePanel/States',
  component: DmQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DmQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the queue request never settles, so the spinner holds. */
export const LoadingSpinner: Story = {
  beforeEach: () => stubQueue(() => new Promise<Response>(() => undefined)),
};

/** Empty: no leads in the DM queue. */
export const EmptyQueue: Story = {
  beforeEach: () => stubQueue(() => json({ items: [], total: 0 })),
};

/** Error: the queue route answers 500 and a toast reports it. */
export const ErrorQueueFailed: Story = {
  beforeEach: () => stubQueue(() => json({}, 500)),
};

/** Long content: a long display name and a long prepared message. */
export const LongContentLeads: Story = {
  beforeEach: () =>
    stubQueue(() =>
      json({
        items: [
          lead(
            'a1',
            'Alexandria Montgomery-Featherstonehaugh of the Long Island Sound',
            'Hey! Loved the new release and the way the whole catalog fits together, would you want a free page that keeps every link in step? '.repeat(
              3
            )
          ),
        ],
        total: 1,
      })
    ),
};

/** Offline: the network request rejects. */
export const OfflineNetworkRejects: Story = {
  beforeEach: () =>
    stubQueue(() => Promise.reject(new TypeError('Failed to fetch'))),
};

/** Right-to-left: an empty queue inside an RTL document. */
export const RtlEmptyQueue: Story = {
  beforeEach: () => stubQueue(() => json({ items: [], total: 0 })),
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
