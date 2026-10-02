import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DropDateChip } from './DropDateChip';

const meta = {
  title: 'Shell/DropDateChip',
  component: DropDateChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Drops in 4 days',
    tone: 'soon',
  },
} satisfies Meta<typeof DropDateChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Soon: Story = {};

export const Past: Story = {
  args: {
    label: 'Released Mar 12',
    tone: 'past',
  },
};

export const Future: Story = {
  args: {
    label: 'Drops Dec 1',
    tone: 'future',
  },
};
