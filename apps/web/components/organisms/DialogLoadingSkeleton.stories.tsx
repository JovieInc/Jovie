import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DialogLoadingSkeleton } from './DialogLoadingSkeleton';

const meta = {
  title: 'Organisms/DialogLoadingSkeleton',
  component: DialogLoadingSkeleton,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onClose: fn(),
  },
} satisfies Meta<typeof DialogLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FewerRows: Story = {
  args: {
    rows: 1,
  },
};

export const SmallDialog: Story = {
  args: {
    size: 'sm',
  },
};
