import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContactDeleteConfirmDialog } from './ContactDeleteConfirmDialog';

const meta = {
  title: 'Dashboard/Molecules/ContactDeleteConfirmDialog',
  component: ContactDeleteConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    contact: { role: 'management', customLabel: null },
    onConfirm: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof ContactDeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const CustomLabel: Story = {
  args: {
    contact: { role: 'other', customLabel: 'Booking agent' },
  },
};

export const Closed: Story = {
  args: {
    contact: null,
  },
};
