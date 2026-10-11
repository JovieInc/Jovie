import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BillingHeader } from './BillingHeader';

const meta = {
  title: 'Organisms/Billing/BillingHeader',
  component: BillingHeader,
  parameters: {
    layout: 'padded',
  },
  args: {
    plan: 'pro',
  },
} satisfies Meta<typeof BillingHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pro: Story = {};

export const Free: Story = {
  args: {
    plan: null,
  },
};
