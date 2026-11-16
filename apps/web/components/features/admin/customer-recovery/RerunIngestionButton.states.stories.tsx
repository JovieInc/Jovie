import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { CustomerIngestionRecoveryReceipt } from '@/app/app/(shell)/admin/actions';
import { RerunIngestionButton } from './RerunIngestionButton';

type RerunMock = () => Promise<CustomerIngestionRecoveryReceipt>;

/**
 * Answers the mocked recovery action for one story through the hook in
 * .storybook/admin-actions-mock.ts, and removes the hook on unmount.
 */
function RerunActionFixture({
  respond,
  children,
}: Readonly<{ respond: RerunMock; children: ReactNode }>) {
  const [restore] = useState(() => {
    const host = globalThis as { __jovieRerunIngestionMock?: RerunMock };
    const previous = host.__jovieRerunIngestionMock;
    host.__jovieRerunIngestionMock = respond;
    return () => {
      host.__jovieRerunIngestionMock = previous;
      settlePendingRequests();
    };
  });
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function withRerunAction(respond: RerunMock) {
  return [
    function WithRerunActionDecorator(Story: () => ReactNode) {
      return (
        <RerunActionFixture respond={respond}>
          <Story />
        </RerunActionFixture>
      );
    },
  ];
}

const BUTTON = { name: 'Re-run Artist Ingestion' };
const FAILED =
  'Recovery could not be requested. The profile was left unchanged; try again.';

/** State coverage for the ingestion recovery button. */
const meta = {
  title: 'Features/Admin/CustomerRecovery/RerunIngestionButton States',
  component: RerunIngestionButton,
  parameters: { layout: 'centered' },
  args: { creatorProfileId: 'cp-1' },
} satisfies Meta<typeof RerunIngestionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * React entangles async transitions, so a request that never settled would
 * hold every later story's transition pending. The loading request settles
 * when the story unmounts.
 */
const pendingRequests = new Set<() => void>();
function pendingRequest(): Promise<CustomerIngestionRecoveryReceipt> {
  return new Promise(resolve => {
    pendingRequests.add(() =>
      resolve({ state: 'requested', queuedCount: 0, checkedAt: 'settled' })
    );
  });
}
function settlePendingRequests() {
  for (const settle of pendingRequests) settle();
  pendingRequests.clear();
}

/** Loading: the request is in flight, so the button spins and is disabled. */
export const LoadingRequest: Story = {
  decorators: withRerunAction(pendingRequest),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', BUTTON));
    await expect(canvas.getByRole('button', BUTTON)).toBeDisabled();
  },
};

/** Error: the server action failed and the profile was left unchanged. */
export const ErrorRequestFailed: Story = {
  decorators: withRerunAction(() =>
    Promise.reject(new Error('Recovery failed'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', BUTTON));
    await expect(await canvas.findByText(FAILED)).toBeInTheDocument();
  },
};

/** Offline: the request never reached the server; the same safe copy shows. */
export const OfflineRequest: Story = {
  decorators: withRerunAction(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', BUTTON));
    await expect(await canvas.findByText(FAILED)).toBeInTheDocument();
  },
};

/** Long content: the longest refusal receipt wraps under the button. */
export const LongContentReceipt: Story = {
  decorators: withRerunAction(async () => ({
    state: 'missing-source',
    queuedCount: 1_234_567,
    checkedAt: '2026-10-02T12:00:00.000Z',
  })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', BUTTON));
    await expect(
      await canvas.findByTestId('rerun-ingestion-receipt')
    ).toHaveTextContent('no linked Spotify source');
  },
};

/** Right-to-left: the button and its receipt inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
