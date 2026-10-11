import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CreateIdentityDialog } from './CreateProfileDialog';

const meta = {
  title: 'Organisms/CreateIdentityDialog',
  component: CreateIdentityDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof CreateIdentityDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};
