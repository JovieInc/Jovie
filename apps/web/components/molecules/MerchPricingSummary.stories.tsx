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

/** The recommendation priced the sale but not the profit yet; ChatMerchCard
 * falls back to $0.00 for the missing half. */
export const PartialProfitPending: Story = {
  args: {
    salePrice: '$28.00',
    profit: '$0.00',
  },
};

export const LongContentPrices: Story = {
  args: {
    salePrice: 'CA$1,249,999.99',
    profit: 'CA$1,034,567.89',
  },
};

export const RtlPrices: Story = {
  args: {
    salePrice: '٢٨٫٠٠ US$',
    profit: '١٠٫٤٠ US$',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-48'>
        <Story />
      </div>
    ),
  ],
};
