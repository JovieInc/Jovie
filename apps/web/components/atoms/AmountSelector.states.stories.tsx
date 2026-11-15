import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AmountSelector } from './AmountSelector';

/**
 * Rendered states of the tip amount tile, shown in the pay row it lives in.
 */
const meta = {
  title: 'Atoms/AmountSelector/States',
  component: AmountSelector,
  parameters: { layout: 'centered' },
  args: {
    amount: 10,
    index: 0,
    isSelected: false,
    onClick: () => undefined,
  },
  decorators: [
    function PayRowFrame(Story) {
      return (
        <div className='w-80 rounded-3xl bg-base p-6 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof AmountSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no custom accessible name, so the default tip label is used. */
export const PartialDefaultLabel: Story = {};

/** Long content: a four-digit amount in a third of the pay row. */
export const LongContentLargeAmount: Story = {
  args: { amount: 2500, isSelected: true },
  render: function LongAmountRow(args) {
    return (
      <div className='grid grid-cols-3 gap-3'>
        <AmountSelector {...args} index={0} amount={500} isSelected={false} />
        <AmountSelector {...args} index={1} />
        <AmountSelector {...args} index={2} amount={10000} isSelected={false} />
      </div>
    );
  },
};

/** Right to left: the pay row in an Arabic layout. */
export const RtlPayRow: Story = {
  args: { isSelected: true },
  render: function RtlAmountRow(args) {
    return (
      <div dir='rtl' lang='ar' className='grid grid-cols-3 gap-3'>
        <AmountSelector {...args} index={0} amount={5} isSelected={false} />
        <AmountSelector {...args} index={1} amount={10} />
        <AmountSelector {...args} index={2} amount={20} isSelected={false} />
      </div>
    );
  },
};
