import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BillingLoadingSkeleton } from './BillingLoadingSkeleton';

const meta = {
  title: 'Organisms/Billing/BillingLoadingSkeleton',
  component: BillingLoadingSkeleton,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof BillingLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
