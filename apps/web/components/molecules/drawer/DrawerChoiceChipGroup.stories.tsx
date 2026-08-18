import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerChoiceChipGroup } from './DrawerChoiceChipGroup';

const options = [
  { value: 'worldwide', label: 'Worldwide' },
  { value: 'north-america', label: 'North America' },
  { value: 'europe', label: 'Europe' },
  { value: 'asia', label: 'Asia' },
] as const;

const meta = {
  title: 'Molecules/Drawer/DrawerChoiceChipGroup',
  component: DrawerChoiceChipGroup,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    options,
    selectedValues: ['north-america'],
    onToggle: fn(),
    ariaLabel: 'Coverage',
  },
} satisfies Meta<typeof DrawerChoiceChipGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleSelected: Story = {
  args: { selectedValues: ['north-america', 'europe'] },
};

export const DisabledOption: Story = {
  args: {
    options: [
      ...options.slice(0, 3),
      { value: 'asia', label: 'Asia', disabled: true },
    ],
  },
};
