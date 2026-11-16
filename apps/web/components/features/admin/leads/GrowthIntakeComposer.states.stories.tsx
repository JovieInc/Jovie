import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { GrowthIntakeComposer } from './GrowthIntakeComposer';

/**
 * Rendered states of the growth intake composer. Each story stubs the one
 * request its mode sends and restores fetch afterwards.
 */
const meta = {
  title: 'Features/Admin/Leads/GrowthIntakeComposer/States',
  component: GrowthIntakeComposer,
  parameters: { layout: 'centered' },
  decorators: [
    function IntakeWidth(Story) {
      return (
        <div className='w-105'>
          <Story />
        </div>
      );
    },
  ],
  args: { initialMode: 'queue' },
} satisfies Meta<typeof GrowthIntakeComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function stubFetch(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => respond();
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

async function queueUrl(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByLabelText('Queue URLs Input'),
    'https://linktr.ee/artist'
  );
  await userEvent.click(
    canvas.getByRole('button', { name: 'Queue Lead URLs' })
  );
}

/** Empty: nothing pasted, zero URLs ready and the action disabled. */
export const EmptyQueue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('0 URLs ready for intake')
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Queue Lead URLs' })
    ).toBeDisabled();
  },
};

/** Loading: the queue request is in flight and the action reads Queueing. */
export const LoadingQueue: Story = {
  beforeEach: stubFetch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    await queueUrl(canvasElement);
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Queueing…' })
    ).toBeDisabled();
  },
};

/** Error: the API rejects the batch and the error banner shows its reason. */
export const ErrorQueueRejected: Story = {
  beforeEach: stubFetch(async () =>
    Response.json({ error: 'Lead intake is paused' }, { status: 503 })
  ),
  play: async ({ canvasElement }) => {
    await queueUrl(canvasElement);
    await expect(
      await within(canvasElement).findByText('Lead intake is paused')
    ).toBeInTheDocument();
  },
};

/** Offline: the request never reaches the server; the pasted URL stays. */
export const OfflineQueue: Story = {
  beforeEach: stubFetch(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    await queueUrl(canvasElement);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Failed to fetch')
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText('Queue URLs Input')).toHaveValue(
      'https://linktr.ee/artist'
    );
  },
};

/** Long content: a long batch paste with every URL counted. */
export const LongContentBatch: Story = {
  args: { initialMode: 'batch' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText('Batch URLs Input'),
      Array.from(
        { length: 10 },
        (_, index) =>
          `https://open.spotify.com/artist/an-unusually-long-artist-identifier-${index + 1}`
      ).join('{enter}')
    );
    await expect(canvas.getByText('10 URLs parsed')).toBeInTheDocument();
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: the single-profile form inside a right-to-left admin page. */
export const RtlSingle: Story = {
  decorators: [withRtl],
  args: { initialMode: 'single' },
};
