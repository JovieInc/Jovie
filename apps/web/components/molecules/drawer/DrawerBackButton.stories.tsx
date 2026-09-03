import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerBackButton } from './DrawerBackButton';

const meta = {
  title: 'Molecules/Drawer/DrawerBackButton',
  component: DrawerBackButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Back to artist',
    onClick: fn(),
  },
} satisfies Meta<typeof DrawerBackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const back = within(canvasElement).getByRole('button', {
      name: 'Back to artist',
    });
    await expect(back.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await userEvent.click(back);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Back to the artist release workspace',
  },
};
