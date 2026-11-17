import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { FilterChip } from './FilterChip';

function NarrowDecorator(Story: () => ReactNode) {
  return (
    <div className='w-48'>
      <Story />
    </div>
  );
}

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/Filters/FilterChip/States',
  component: FilterChip,
  parameters: { layout: 'centered' },
  args: {
    pressed: false,
    onClick: fn(),
    children: 'Overdue',
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long chip label in a narrow toolbar. */
export const LongContentLabel: Story = {
  args: {
    pressed: true,
    children: 'Waiting on artwork approval from the label',
  },
  decorators: [NarrowDecorator],
};

/** RTL: an Arabic chip in a right-to-left toolbar. */
export const RtlChip: Story = {
  args: { children: 'متأخر' },
  decorators: [RtlDecorator],
};
