import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AmountSelector } from './AmountSelector';

/**
 * AmountSelector is a tip/pay tile, not a free-floating badge.
 * Always show it in a product composition (pay row / card), never as a lone
 * circle on a void background.
 */
const meta: Meta<typeof AmountSelector> = {
  title: 'Atoms/AmountSelector',
  component: AmountSelector,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light' },
    docs: {
      description: {
        component:
          'Tip amount tile used inside PaySelector. Prefer the pay-row composition stories over bare args.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='w-[22rem] rounded-3xl border border-black/6 bg-base p-6 text-primary-token shadow-sm dark:border-white/10'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

function PayAmountRow({
  amounts = [5, 10, 20],
  initialIndex = 1,
  disabled = false,
}: {
  amounts?: number[];
  initialIndex?: number;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(initialIndex);

  return (
    <div className='space-y-3'>
      <div className='text-sm font-medium text-secondary-token'>
        Choose amount
      </div>
      <div className='grid grid-cols-3 gap-3'>
        {amounts.map((amount, index) => (
          <AmountSelector
            key={amount}
            amount={amount}
            index={index}
            isSelected={selected === index}
            onClick={setSelected}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

/** Canonical product composition — this is how the tile appears in product. */
export const InPayRow: Story = {
  render: () => <PayAmountRow />,
};

export const SelectedMiddle: Story = {
  render: () => <PayAmountRow amounts={[5, 10, 20]} initialIndex={1} />,
};

export const CompactTips: Story = {
  render: () => <PayAmountRow amounts={[3, 5, 10]} initialIndex={0} />,
};

export const DisabledRow: Story = {
  render: () => <PayAmountRow disabled />,
};
