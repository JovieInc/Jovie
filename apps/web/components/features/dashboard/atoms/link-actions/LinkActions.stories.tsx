import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinkActions } from './LinkActions';

const meta = {
  title: 'Dashboard/Atoms/LinkActions/LinkActions',
  component: LinkActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    isVisible: true,
    onToggle: () => {},
    onRemove: () => {},
    onEdit: () => {},
  },
} satisfies Meta<typeof LinkActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const Hidden: Story = {
  args: {
    isVisible: false,
  },
};

export const WithDragHandle: Story = {
  args: {
    showDragHandle: true,
    onDragHandlePointerDown: () => {},
  },
};
