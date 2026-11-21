import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DialogLoadingSkeleton } from './DialogLoadingSkeleton';

const meta = {
  title: 'Organisms/DialogLoadingSkeleton/States',
  component: DialogLoadingSkeleton,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onClose: fn(),
  },
} satisfies Meta<typeof DialogLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the dialog shell while its content is still being fetched. */
export const Loading: Story = {};

/** Empty: the shortest placeholder, one result row only. */
export const Empty: Story = {
  args: { rows: 1 },
};

/** Offline: the placeholder stays put (no error flash) when the fetch cannot start. */
export const Offline: Story = {
  args: { size: 'sm', rows: 2 },
};
