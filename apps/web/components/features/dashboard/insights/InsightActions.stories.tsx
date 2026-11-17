import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { InsightActions } from './InsightActions';

type FetchStub = typeof globalThis.fetch;

function stubFetch(next: FetchStub) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * State coverage for the insight Dismiss and Done actions. Each story stubs
 * the PATCH /api/insights/:id request the mutation sends, then presses
 * Dismiss so the pending, failed or offline outcome is visible.
 */
const meta = {
  title: 'Dashboard/Insights/InsightActions',
  component: InsightActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    insightId: 'insight-story',
  },
} satisfies Meta<typeof InsightActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the update never settles, so both actions stay disabled. */
export const LoadingUpdatePending: Story = {
  beforeEach: () => stubFetch(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Done' })).toBeDisabled()
    );
  },
};

/** Error: the server refuses the update, so both actions re-enable for a retry. */
export const ErrorUpdateRejected: Story = {
  beforeEach: () =>
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'Update failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
    );
  },
};

/** Offline: the request fails at the network, and the actions re-enable. */
export const OfflineNetworkFailure: Story = {
  beforeEach: () =>
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Done' })).toBeEnabled()
    );
  },
};

/** Right-to-left: the action pair inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
