import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DrawerPropertyRow } from './DrawerPropertyRow';

const meta = {
  title: 'Molecules/Drawer/DrawerPropertyRow',
  component: DrawerPropertyRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => <div className='w-full max-w-md bg-surface-0 p-3'>{Story()}</div>,
  ],
  args: {
    label: 'Release status',
    value: 'Ready for review',
  },
} satisfies Meta<typeof DrawerPropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {};

export const Interactive: Story = {
  args: {
    interactive: true,
    onClick: fn(),
    label: 'Open release',
    value: 'Summer EP',
  },
  play: async ({ canvasElement, args }) => {
    const property = within(canvasElement).getByRole('button', {
      name: 'Open release Summer EP',
    });
    await userEvent.click(property);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Compact: Story = {
  args: {
    size: 'sm',
    align: 'start',
    labelWidth: 120,
    label: 'Description',
    value: 'A short release summary.',
  },
};
