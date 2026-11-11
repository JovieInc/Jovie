import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import BillingSuccessLoading from '@/app/billing/success/loading';

/**
 * /billing/success while it resolves the plan: the status pill, three unlock
 * cards and the main button, drawn at the loaded page's height so nothing
 * moves when the paid view replaces it.
 */
const meta = {
  title: 'Pages/Billing/Success Loading',
  component: BillingSuccessLoading,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
  },
} satisfies Meta<typeof BillingSuccessLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
