import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BillingDashboard } from './BillingDashboard';

const meta = {
  title: 'Organisms/BillingDashboard',
  component: BillingDashboard,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof BillingDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
