import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { X } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';
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
  play: async ({ canvasElement }) => {
    const close = within(canvasElement).getByRole('button', {
      name: 'Close details',
    });
    await userEvent.click(close);
    await expect(close).toHaveFocus();
  },
};

export const Placeholder: Story = {
  args: {
    title: undefined,
  },
};
