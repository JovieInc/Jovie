import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys, useBillingHistoryQuery } from '@/lib/queries';
import type { BillingHistoryEntry } from '@/lib/queries/useBillingHistoryQuery';
import { BillingHistorySection } from './BillingHistorySection';

const entries: BillingHistoryEntry[] = [
  {
    eventType: 'subscription_created',
    timestamp: '2026-09-01T12:00:00.000Z',
    amount: 1200,
    currency: 'usd',
    status: 'paid',
    maskedIdentifier: 'card_4242',
  },
  {
    eventType: 'invoice_paid',
    timestamp: '2026-08-01T12:00:00.000Z',
    amount: 1200,
    currency: 'usd',
    status: 'paid',
    maskedIdentifier: 'card_4242',
  },
];

function BillingHistoryDemo() {
  const historyQuery = useBillingHistoryQuery();
  return <BillingHistorySection historyQuery={historyQuery} />;
}

function withHistoryData(data: { entries: BillingHistoryEntry[] }) {
  return function Provider({
    children,
  }: {
    readonly children: React.ReactNode;
  }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.billing.invoices(), data);
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Organisms/Billing/BillingHistorySection',
  component: BillingHistoryDemo,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof BillingHistoryDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  decorators: [
    Story => {
      const Provider = withHistoryData({ entries });
      return (
        <Provider>
          <Story />
        </Provider>
      );
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      const Provider = withHistoryData({ entries: [] });
      return (
        <Provider>
          <Story />
        </Provider>
      );
    },
  ],
};
