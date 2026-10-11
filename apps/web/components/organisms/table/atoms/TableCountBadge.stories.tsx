import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableCountBadge } from './TableCountBadge';

const meta = {
  title: 'Organisms/Table/Atoms/TableCountBadge',
  component: TableCountBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    totalCount: 128,
  },
} satisfies Meta<typeof TableCountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Total: Story = {};

export const WithSelection: Story = {
  args: {
    selectedCount: 5,
  },
};

export const TextVariant: Story = {
  args: {
    variant: 'text',
    selectedCount: 5,
  },
};
