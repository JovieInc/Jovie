import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PaySection } from './PaySection';

/** Content and failure states of the pay section that the base stories do not name. */
const meta: Meta<typeof PaySection> = {
  title: 'Organisms/PaySection/States',
  component: PaySection,
  parameters: { layout: 'centered' },
  args: { handle: 'artist' },
};

export default meta;
type Story = StoryObj<typeof PaySection>;

/** Empty: no payment method is configured, so the section says so. */
export const EmptyNoPaymentMethods: Story = {};

/** Error: the card payment rejects, which raises the failure toast on Pay. */
export const ErrorStripeRejects: Story = {
  args: {
    onStripePayment: async () => {
      throw new Error('Card declined');
    },
  },
};

/** Partial: one amount and one method, so there is nothing to switch. */
export const PartialSingleAmount: Story = {
  args: { amounts: [10], onStripePayment: async () => undefined },
};

/** Long content: many amount options in the three-column grid. */
export const LongContentManyAmounts: Story = {
  args: {
    amounts: [5, 10, 20, 50, 100, 250, 500],
    onStripePayment: async () => undefined,
  },
};

/** Offline: card payment cannot reach the network; failure toast on Pay. */
export const OfflineStripeUnreachable: Story = {
  args: {
    onStripePayment: async () => {
      throw new TypeError('Failed to fetch');
    },
  },
};

/** RTL overflow: amounts and method dial in a narrow RTL frame. */
export const RtlOverflowCustomAmount: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-64'>
        <Story />
      </div>
    ),
  ],
  args: {
    handle: 'فنان',
    amounts: [5, 10, 20],
    onStripePayment: async () => undefined,
  },
};
