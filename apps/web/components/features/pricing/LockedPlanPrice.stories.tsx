import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LockedPlanPrice } from './LockedPlanPrice';

const meta = {
  title: 'Features/Pricing/LockedPlanPrice',
  component: LockedPlanPrice,
  parameters: { layout: 'padded' },
  args: { price: '$12', cadence: '/mo' },
} satisfies Meta<typeof LockedPlanPrice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Signed out (and signed in without a lock): the list price. */
export const ListPrice: Story = {};
