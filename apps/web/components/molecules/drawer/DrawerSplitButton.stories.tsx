import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Pin, Share2, Trash2 } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerSplitButton } from './DrawerSplitButton';

const menuItems = [
  {
    id: 'share',
    type: 'action' as const,
    label: 'Share',
    icon: <Share2 className='h-3.5 w-3.5' />,
    onClick: fn(),
  },
  {
    id: 'delete',
    type: 'action' as const,
    label: 'Delete',
    icon: <Trash2 className='h-3.5 w-3.5' />,
    onClick: fn(),
    variant: 'destructive' as const,
  },
];

const meta = {
  title: 'Molecules/Drawer/DrawerSplitButton',
  component: DrawerSplitButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    primaryAction: {
      ariaLabel: 'Pin',
      label: 'Pin',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
    },
    menuItems,
  },
} satisfies Meta<typeof DrawerSplitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const primary = canvas.getByRole('button', { name: 'Pin' });
    await userEvent.click(primary);
    await expect(args.primaryAction?.onClick).toHaveBeenCalled();
  },
};

export const PrimaryOnly: Story = {
  args: {
    menuItems: [],
  },
};

export const MenuOnly: Story = {
  args: {
    primaryAction: undefined,
  },
};

export const IconOnlyPrimary: Story = {
  args: {
    primaryAction: {
      ariaLabel: 'Pin',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
    },
  },
};

export const DisabledPrimary: Story = {
  args: {
    primaryAction: {
      ariaLabel: 'Pin',
      label: 'Pin',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
      disabled: true,
    },
    menuItems: [],
  },
};
