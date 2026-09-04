import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Settings } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
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
    onClick: fn(),
  },
} satisfies Meta<typeof DrawerButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {
  play: async ({ canvasElement, args }) => {
    const save = within(canvasElement).getByRole('button', {
      name: 'Save changes',
    });
    await userEvent.click(save);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

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
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Save changes' })
    ).toBeDisabled();
  },
};
