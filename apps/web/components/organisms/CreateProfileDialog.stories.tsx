import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CreateProfileDialog } from './CreateProfileDialog';

const meta = {
  title: 'Organisms/CreateProfileDialog',
  component: CreateProfileDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof CreateProfileDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};
