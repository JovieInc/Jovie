import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { MerchPricingPresetOption } from './MerchPricingPresetPicker';
import { MerchPricingPresetPicker } from './MerchPricingPresetPicker';

const options: MerchPricingPresetOption[] = [
  { preset: 'safe', label: 'Safe', salePrice: '$24', profit: '$6' },
  { preset: 'standard', label: 'Standard', salePrice: '$28', profit: '$10' },
  {
    preset: 'aggressive',
    label: 'Aggressive',
    salePrice: '$32',
    profit: '$14',
  },
];

const meta = {
  title: 'Molecules/MerchPricingPresetPicker',
  component: MerchPricingPresetPicker,
  parameters: {
    layout: 'centered',
  },
  args: {
    options,
    value: 'standard',
    onChange: fn(),
  },
} satisfies Meta<typeof MerchPricingPresetPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const aggressive = canvas.getByRole('radio', { name: 'Aggressive' });
    await userEvent.click(aggressive);
    await expect(args.onChange).toHaveBeenCalledWith('aggressive');
  },
};

export const SafeSelected: Story = {
  args: {
    value: 'safe',
  },
};

// No priced option yet (the product has no cost data): the group stays
// labelled and takes no space for options it cannot offer.
export const EmptyNoOptions: Story = {
  args: {
    options: [],
  },
};

const longOptions: MerchPricingPresetOption[] = [
  {
    preset: 'safe',
    label: 'Safe margin for a first small-batch run',
    salePrice: '$24',
    profit: '$6',
  },
  {
    preset: 'standard',
    label: 'Standard margin most independent artists choose',
    salePrice: '$28',
    profit: '$10',
  },
  {
    preset: 'aggressive',
    label: 'Aggressive margin for limited collector editions',
    salePrice: '$32',
    profit: '$14',
  },
];

export const LongLabels: Story = {
  args: {
    options: longOptions,
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
