import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { FilterCheckboxItem } from './FilterCheckboxItem';

const MenuDecorator: Decorator = Story => (
  <div role='menu' className='w-64 bg-surface-1'>
    <Story />
  </div>
);
const RtlDecorator: Decorator = Story => (
  <div dir='rtl' lang='ar'>
    <Story />
  </div>
);

const meta = {
  title: 'Molecules/Filters/FilterCheckboxItem/States',
  component: FilterCheckboxItem,
  decorators: [MenuDecorator],
  args: { label: 'Todo', checked: false, onCheckedChange: fn() },
} satisfies Meta<typeof FilterCheckboxItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = {};
export const LongContent: Story = {
  args: {
    label: 'Needs review before the release can be scheduled',
    count: 124,
  },
};
export const Rtl: Story = {
  args: { label: 'يحتاج إلى المراجعة', checked: true },
  decorators: [RtlDecorator],
};
