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
