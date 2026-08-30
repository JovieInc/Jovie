import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Settings } from 'lucide-react';
import { DrawerButton } from './DrawerButton';

const meta = {
  title: 'Molecules/Drawer/DrawerButton',
  component: DrawerButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    type: 'button',
    children: 'Save changes',
  },
} satisfies Meta<typeof DrawerButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};

export const Primary: Story = {
  args: {
    tone: 'primary',
  },
};

export const Ghost: Story = {
  args: {
    tone: 'ghost',
    children: 'View details',
  },
};

export const IconOnly: Story = {
  render: () => (
    <DrawerButton size='icon' aria-label='Open settings'>
      <Settings aria-hidden='true' />
    </DrawerButton>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
