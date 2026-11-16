import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BillingLoadingSkeleton } from './BillingLoadingSkeleton';

/**
 * State coverage for the billing page skeleton. The skeleton is itself the
 * page's loading state, so its one state story is that frame.
 */
const meta = {
  title: 'Organisms/Billing/BillingLoadingSkeleton States',
  component: BillingLoadingSkeleton,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof BillingLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the full billing page placeholder. */
export const LoadingBillingPage: Story = {};
