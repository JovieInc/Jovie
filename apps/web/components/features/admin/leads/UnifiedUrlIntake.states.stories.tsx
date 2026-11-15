import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { UnifiedUrlIntake } from './UnifiedUrlIntake';

/**
 * Rendered states of the URL intake card. Each story stubs the one POST to
 * /api/admin/leads that the queue mutation sends, and restores fetch after.
 */
const meta = {
  title: 'Features/Admin/Leads/UnifiedUrlIntake/States',
  component: UnifiedUrlIntake,
  parameters: { layout: 'centered' },
  args: { onSubmitted: fn() },
} satisfies Meta<typeof UnifiedUrlIntake>;

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

async function pasteAndQueue(canvasElement: HTMLElement, urls: string) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText('Lead URLs'), urls);
  await userEvent.click(canvas.getByRole('button', { name: 'Queue URLs' }));
}

/** Empty: nothing pasted yet, so Queue URLs stays disabled. */
export const EmptyIntake: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Queue URLs' })
    ).toBeDisabled();
  },
};

/** Loading: the queue request is in flight and the button shows a spinner. */
export const LoadingQueue: Story = {
  beforeEach: stubFetch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    await pasteAndQueue(canvasElement, 'https://linktr.ee/artist');
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Queue URLs' })
    ).toBeDisabled();
  },
};

/** Error: the API rejects the batch and the toast shows its message. */
export const ErrorQueueRejected: Story = {
  args: { onActionError: fn() },
  beforeEach: stubFetch(async () =>
    Response.json({ error: 'Lead intake is paused' }, { status: 503 })
  ),
  play: async ({ canvasElement, args }) => {
    await pasteAndQueue(canvasElement, 'https://linktr.ee/artist');
    // The harness's mock '/test' pathname is a profile route, where
    // FeedbackProvider mounts no Toaster — the failure toast can never
    // render in this lane. The surface reports the failure to its owner;
    // assert the exact message through the reporter (ProfileSidebarHeader
    // convention).
    await expect(args.onActionError).toHaveBeenCalledWith(
      'Lead intake is paused'
    );
  },
};

/** Offline: the request never reaches the server; the pasted URLs stay. */
export const OfflineQueue: Story = {
  args: { onActionError: fn() },
  beforeEach: stubFetch(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement, args }) => {
    await pasteAndQueue(canvasElement, 'https://linktr.ee/artist');
    // The harness's mock '/test' pathname is a profile route, where
    // FeedbackProvider mounts no Toaster — the failure toast can never
    // render in this lane. The surface reports the failure to its owner;
    // assert the exact message through the reporter (ProfileSidebarHeader
    // convention).
    await expect(args.onActionError).toHaveBeenCalledWith('Failed to fetch');
    // The offline path keeps the pasted URLs so nothing is lost.
    await expect(within(canvasElement).getByLabelText('Lead URLs')).toHaveValue(
      'https://linktr.ee/artist'
    );
  },
};

/** Long content: a long paste of mixed URLs in the five-row field. */
export const LongContentPaste: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText('Lead URLs'),
      Array.from(
        { length: 12 },
        (_, index) =>
          `https://open.spotify.com/artist/an-unusually-long-artist-identifier-${index + 1}`
      ).join('{enter}')
    );
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: the intake card inside a right-to-left admin page. */
export const RtlIntake: Story = {
  decorators: [withRtl],
};
