import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TipSelector } from './TipSelector';

const meta: Meta<typeof TipSelector> = {
  title: 'Molecules/TipSelector',
  component: TipSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isLoading: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
};

export const CustomAmounts: Story = {
  args: {
    amounts: [2, 5, 10],
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
};

export const LargeAmounts: Story = {
  args: {
    amounts: [10, 25, 50],
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
};

export const FiveOptions: Story = {
  args: {
    amounts: [1, 3, 5, 10, 20],
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
  render: args => (
    <div className='w-80'>
      <div className='grid grid-cols-5 gap-2 mb-4'>
        {args.amounts?.map(amount => (
          <button
            key={amount}
            type='button'
            className='w-full aspect-square rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center cursor-pointer bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 border-black/40 hover:border-black/70 dark:border-white/30 dark:hover:border-white/60'
          >
            ${amount}
          </button>
        ))}
      </div>
      <button className='w-full bg-blue-600 text-white rounded-lg py-3 font-medium'>
        Continue
      </button>
    </div>
  ),
};

export const Loading: Story = {
  args: {
    isLoading: true,
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
};

export const VenmoAmounts: Story = {
  args: {
    amounts: [3, 5, 7],
    onContinue: amount => console.log(`Continue to Venmo with $${amount}`),
  },
};

export const StripeAmounts: Story = {
  args: {
    amounts: [2, 5, 10],
    onContinue: amount => console.log(`Process $${amount} tip via Stripe`),
  },
};

export const InteractiveDemo: Story = {
  render: () => {
    const handleContinue = (amount: number) => {
      alert(
        `You selected $${amount}! This would normally continue to payment.`
      );
    };

    return (
      <div className='max-w-sm'>
        <TipSelector amounts={[3, 5, 10]} onContinue={handleContinue} />
      </div>
    );
  },
};

export const InDarkMode: Story = {
  args: {
    amounts: [5, 10, 20],
    onContinue: amount => console.log(`Selected amount: $${amount}`),
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
