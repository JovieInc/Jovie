import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { BillingActionsSection } from './BillingActionsSection';

function Frame(Story: () => ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Story />
    </QueryClientProvider>
  );
}

function Frame2(Story: () => ReactNode) {
  return (
    <div className='w-64'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the subscription management card. The canonical stories
 * stay in BillingActionsSection.stories.tsx; these change only the width the
 * card lays out in and the document direction.
 */
const meta = {
  title: 'Organisms/Billing/BillingActionsSection States',
  component: BillingActionsSection,
  parameters: {
    layout: 'centered',
  },
  args: {
    cancelDialogOpen: false,
    setCancelDialogOpen: () => {},
    handleCancelSubscription: () => {},
    cancelMutationPending: false,
  },
  decorators: [Frame],
} satisfies Meta<typeof BillingActionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: the header copy and both actions wrap inside a narrow card. */
export const LongContentNarrowCard: Story = {
  decorators: [Frame2],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Cancel Subscription' })
    ).toBeVisible();
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [RtlFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Manage Subscription')).toBeVisible();
  },
};
