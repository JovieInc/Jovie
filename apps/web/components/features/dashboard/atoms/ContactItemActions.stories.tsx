import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContactItemActions } from './ContactItemActions';

const meta = {
  title: 'Dashboard/Atoms/ContactItemActions',
  component: ContactItemActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    onSave: () => {},
    onCancel: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof ContactItemActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Saving: Story = {
  args: { isSaving: true },
};

export const Deleting: Story = {
  args: { isDeleting: true },
};
