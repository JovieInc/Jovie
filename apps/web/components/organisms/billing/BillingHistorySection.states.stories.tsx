import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import type { useBillingHistoryQuery } from '@/lib/queries';
import type { BillingHistoryEntry } from '@/lib/queries/useBillingHistoryQuery';
import { BillingHistorySection } from './BillingHistorySection';

type HistoryQuery = ReturnType<typeof useBillingHistoryQuery>;

/** A query result shaped like the TanStack one; the section reads only these fields. */
function historyQuery(
  fields: Partial<Pick<HistoryQuery, 'isLoading' | 'error' | 'data'>>
): HistoryQuery {
  return {
    isLoading: false,
    error: null,
    data: undefined,
    ...fields,
  } as unknown as HistoryQuery;
}

const entry = (
  eventType: string,
  timestamp: string,
  status: string | null = 'paid'
): BillingHistoryEntry => ({
  eventType,
  timestamp,
  amount: 1200,
  currency: 'usd',
  status,
  maskedIdentifier: `${eventType}-${timestamp}`,
});

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for billing history. The canonical stories in
 * BillingHistorySection.stories.tsx seed a real query cache; these pass the
 * query result the section reads directly, one per state.
 */
const meta = {
  title: 'Organisms/Billing/BillingHistorySection States',
  component: BillingHistorySection,
  parameters: {
    layout: 'padded',
  },
  args: {
    historyQuery: historyQuery({}),
  },
} satisfies Meta<typeof BillingHistorySection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the query has not resolved yet, so skeleton rows hold the space. */
export const Loading: Story = {
  args: { historyQuery: historyQuery({ isLoading: true }) },
};

/** Error: the history request failed. */
export const ErrorLoadingHistory: Story = {
  args: { historyQuery: historyQuery({ error: new Error('500') }) },
  play: async ({ canvasElement }) => {
    // The section fades in on mount (motion opacity 0 -> 1, 0.2s delay);
    // jest-dom's toBeVisible counts an opacity-0 ancestor as invisible, so
    // await the settled state instead of racing the mount animation.
    await waitFor(() =>
      expect(
        within(canvasElement).getByText('Unable to load billing history.')
      ).toBeVisible()
    );
  },
};

/** Offline: the browser could not reach the server, which reads as a failed request. */
export const OfflineHistoryUnavailable: Story = {
  args: {
    historyQuery: historyQuery({ error: new TypeError('Failed to fetch') }),
  },
  play: async ({ canvasElement }) => {
    // Same mount-animation race as Error Loading History — the request
    // failing offline renders the identical error branch.
    await waitFor(() =>
      expect(
        within(canvasElement).getByText('Unable to load billing history.')
      ).toBeVisible()
    );
  },
};

/** Long content: many events, one with an unmapped event type and long status. */
export const LongContentManyEvents: Story = {
  args: {
    historyQuery: historyQuery({
      data: {
        entries: [
          entry(
            'invoice.payment_action_required.after_three_d_secure_challenge',
            '2026-10-01T12:00:00.000Z',
            'requires_payment_method_confirmation'
          ),
          ...Array.from({ length: 8 }, (_, i) =>
            entry(
              i % 2 ? 'payment_succeeded' : 'subscription_updated',
              `2026-0${(i % 9) + 1}-01T12:00:00.000Z`
            )
          ),
        ],
      },
    }),
  },
};

/** Right-to-left: the populated list inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    historyQuery: historyQuery({
      data: {
        entries: [
          entry('subscription_created', '2026-09-01T12:00:00.000Z'),
          entry('payment_failed', '2026-08-01T12:00:00.000Z', 'failed'),
        ],
      },
    }),
  },
  decorators: [RtlFrame],
};
