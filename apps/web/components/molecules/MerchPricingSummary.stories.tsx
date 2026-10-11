import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MerchPricingSummary } from './MerchPricingSummary';

const meta = {
  title: 'Molecules/MerchPricingSummary',
  component: MerchPricingSummary,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-48'>
        <Story />
      </div>
    ),
  ],
  args: {
    salePrice: '$28.00',
    profit: '$10.40',
  },
} satisfies Meta<typeof MerchPricingSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
