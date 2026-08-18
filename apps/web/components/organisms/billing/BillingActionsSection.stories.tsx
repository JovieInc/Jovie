import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BillingActionsSection } from './BillingActionsSection';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function BillingActionsStory({
  initialOpen = false,
  pending = false,
}: {
  readonly initialOpen?: boolean;
  readonly pending?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-full max-w-2xl'>
        <BillingActionsSection
          cancelDialogOpen={open}
          setCancelDialogOpen={setOpen}
          handleCancelSubscription={() => undefined}
          cancelMutationPending={pending}
        />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/Billing/BillingActionsSection',
  component: BillingActionsSection,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof BillingActionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <BillingActionsStory />,
};

export const CancellationDialog: Story = {
  render: () => <BillingActionsStory initialOpen />,
};

export const PendingCancellation: Story = {
  render: () => <BillingActionsStory initialOpen pending />,
};
