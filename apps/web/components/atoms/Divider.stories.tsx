import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Divider } from './Divider';

const meta = {
  title: 'Atoms/Divider',
  component: Divider,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-64 space-y-3'>
      <p className='text-app text-secondary-token'>Above</p>
      <Divider {...args} />
      <p className='text-app text-secondary-token'>Below</p>
    </div>
  ),
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};

export const HorizontalInset: Story = {
  args: {
    inset: true,
  },
};

export const Vertical: Story = {
  render: args => (
    <div className='flex h-16 items-center gap-3'>
      <p className='text-app text-secondary-token'>Left</p>
      <Divider {...args} orientation='vertical' />
      <p className='text-app text-secondary-token'>Right</p>
    </div>
  ),
};

export const DecorativeHidden: Story = {
  name: 'Decorative (aria-hidden)',
  args: {
    ariaHidden: true,
  },
};
