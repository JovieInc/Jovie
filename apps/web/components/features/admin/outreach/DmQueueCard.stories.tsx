import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { DmQueueCard } from './DmQueueCard';

const lead = {
  id: 'lead-1',
  displayName: 'Ari Lane',
  instagramHandle: 'arilane',
  priorityScore: 92,
  dmCopy: 'Hey Ari, your Jovie page is ready: https://jov.ie/claim/demo',
  outreachStatus: 'pending',
};

type FetchFn = typeof fetch;

function stubFetch(next: FetchFn) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

function withHangingFetch(Story: () => React.JSX.Element) {
  stubFetch(() => new Promise<Response>(() => {}));
  return <Story />;
}

function withOfflineFetch(Story: () => React.JSX.Element) {
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  return <Story />;
}

function withRejectedFetch(Story: () => React.JSX.Element) {
  stubFetch(async () =>
    Response.json({ error: 'Server error' }, { status: 500 })
  );
  return <Story />;
}

async function pressMarkSent({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: "Mark as DM'd" })
  );
}

const meta = {
  title: 'Features/Admin/Outreach/DmQueueCard',
  component: DmQueueCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
  args: { lead, onMarkedSent: () => {} },
} satisfies Meta<typeof DmQueueCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LoadingMarkingSent: Story = {
  decorators: [withHangingFetch],
  play: pressMarkSent,
};

export const EmptyNoDraftCopy: Story = {
  args: { lead: { ...lead, dmCopy: null, priorityScore: null } },
};

export const ErrorMarkSentFailed: Story = {
  decorators: [withRejectedFetch],
  play: pressMarkSent,
};

export const OfflineMarkSentFailed: Story = {
  decorators: [withOfflineFetch],
  play: pressMarkSent,
};

export const LongContentDraft: Story = {
  args: {
    lead: {
      ...lead,
      displayName: 'Ada and the Midnight Orchestra featuring Friends',
      instagramHandle: 'ada_and_the_midnight_orchestra_official',
      dmCopy: `${lead.dmCopy} `.repeat(8),
    },
  },
};

export const RtlDraft: Story = {
  args: {
    lead: {
      ...lead,
      displayName: 'عدا',
      dmCopy: 'مرحبا عدا، صفحتك على جووفي جاهزة للمراجعة.',
    },
  },
};
