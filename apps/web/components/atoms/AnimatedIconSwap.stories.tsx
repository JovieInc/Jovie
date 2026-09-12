import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Menu } from 'lucide-react';
import { AnimatedIconSwap } from './AnimatedIconSwap';

const meta: Meta<typeof AnimatedIconSwap> = {
  title: 'Atoms/AnimatedIconSwap',
  component: AnimatedIconSwap,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof AnimatedIconSwap>;

export const MenuIcon: Story = {
  args: {
    activeKey: 'menu',
    children: <Menu aria-hidden='true' size={20} />,
    className: 'size-5',
  },
};
