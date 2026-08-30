import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { X } from 'lucide-react';
import { DrawerButton } from './DrawerButton';
import { DrawerHeader } from './DrawerHeader';

const meta = {
  title: 'Molecules/Drawer/DrawerHeader',
  component: DrawerHeader,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-md bg-surface-0'>{Story()}</div>,
  ],
} satisfies Meta<typeof DrawerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
  args: {
    title: 'Artist details',
  },
};

export const WithActions: Story = {
  args: {
    title: 'Artist details',
    actions: (
      <DrawerButton size='icon' tone='ghost' aria-label='Close details'>
        <X aria-hidden='true' />
      </DrawerButton>
    ),
  },
};

export const Placeholder: Story = {
  args: {
    title: undefined,
  },
};
