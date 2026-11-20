import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerChoiceChipGroup } from './DrawerChoiceChipGroup';

const RtlDecorator: Decorator = Story => (
  <div dir='rtl' lang='ar'>
    <Story />
  </div>
);

const meta = {
  title: 'Molecules/Drawer/DrawerChoiceChipGroup/States',
  component: DrawerChoiceChipGroup,
  args: {
    options: [{ value: 'europe', label: 'Europe' }],
    selectedValues: [],
    onToggle: fn(),
    ariaLabel: 'Coverage',
  },
} satisfies Meta<typeof DrawerChoiceChipGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { options: [] } };
export const Partial: Story = {};
export const LongContent: Story = {
  args: {
    options: [
      {
        value: 'north-america',
        label: 'North America and surrounding territories',
      },
    ],
  },
};
export const Rtl: Story = {
  args: {
    options: [
      { value: 'region', label: 'أمريكا الشمالية والمناطق المحيطة بها' },
    ],
    ariaLabel: 'التغطية',
  },
  decorators: [RtlDecorator],
};
