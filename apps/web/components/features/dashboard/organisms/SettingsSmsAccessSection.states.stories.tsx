import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SettingsSmsAccessSection } from './SettingsSmsAccessSection';

/** Replaces fetch for one story and restores it when the story unmounts. */
function stubFetch(impl: () => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (() => impl()) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function requestAccess(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Request SMS Access' })
  );
}

const meta = {
  title: 'Dashboard/Organisms/SettingsSmsAccessSection/States',
  component: SettingsSmsAccessSection,
  parameters: { layout: 'padded' },
  args: { smsSubscriberCount: 0, alreadyRequested: false },
} satisfies Meta<typeof SettingsSmsAccessSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the request is in flight and never settles. */
export const LoadingRequestPending: Story = {
  beforeEach: () => stubFetch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    await requestAccess(canvasElement);
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Requesting...',
      })
    ).toBeDisabled();
  },
};

/** Empty: nobody has signed up for text alerts yet. */
export const EmptyNoSubscribers: Story = {};

/** Error: the server rejects the request and the message shows inline. */
export const ErrorRequestRejected: Story = {
  beforeEach: () =>
    stubFetch(async () =>
      Response.json(
        { error: 'SMS access is not available yet' },
        { status: 500 }
      )
    ),
  play: async ({ canvasElement }) => {
    await requestAccess(canvasElement);
    await within(canvasElement).findAllByText(
      'SMS access is not available yet'
    );
  },
};

/** Long content: a subscriber count far wider than the usual two digits. */
export const LongContentSubscriberCount: Story = {
  args: { smsSubscriberCount: 1234567890, alreadyRequested: true },
};

/** Offline: the network is down, so the request fails before any reply. */
export const OfflineRequestFailed: Story = {
  beforeEach: () =>
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    await requestAccess(canvasElement);
    await within(canvasElement).findAllByText('Failed to fetch');
  },
};

/** Rtl: the panel inside a right-to-left container. */
export const RtlPanel: Story = {
  args: { smsSubscriberCount: 3, alreadyRequested: true },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
