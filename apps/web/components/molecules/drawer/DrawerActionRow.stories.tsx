import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowRight, Link2 } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerActionRow } from './DrawerActionRow';

const meta = {
  title: 'Molecules/Drawer/DrawerActionRow',
  component: DrawerActionRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-sm bg-surface-0 p-3'>{Story()}</div>,
  ],
  args: {
    label: 'Open public profile',
    onClick: fn(),
    icon: <Link2 aria-hidden='true' className='size-3.5' />,
    trailing: <ArrowRight aria-hidden='true' className='size-3.5' />,
  },
} satisfies Meta<typeof DrawerActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const action = within(canvasElement).getByRole('button', {
      name: 'Open public profile',
    });
    await userEvent.click(action);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const WithoutTrailingAction: Story = {
  args: {
    label: 'Edit profile details',
    trailing: undefined,
  },
};

export const TextOnly: Story = {
  args: {
    label: 'View release notes',
    icon: undefined,
    trailing: undefined,
  },
};
