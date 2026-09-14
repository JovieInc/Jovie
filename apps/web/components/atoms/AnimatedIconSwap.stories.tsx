import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Copy, Menu } from 'lucide-react';
import { AnimatedIconSwap } from './AnimatedIconSwap';

const meta = {
  title: 'Atoms/AnimatedIconSwap',
  component: AnimatedIconSwap,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnimatedIconSwap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MenuIcon: Story = {
  args: {
    activeKey: 'menu',
    children: <Menu aria-hidden='true' size={20} />,
    className: 'size-5',
  },
};

export const CopyState: Story = {
  render: () => (
    <AnimatedIconSwap activeKey='copy' className='size-5'>
      <Copy className='size-4' aria-hidden='true' />
    </AnimatedIconSwap>
  ),
};

export const CheckState: Story = {
  render: () => (
    <AnimatedIconSwap activeKey='check' className='size-5'>
      <Check className='size-4' aria-hidden='true' />
    </AnimatedIconSwap>
  ),
};
