import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableColumnCompacts } from './TableColumnCompacts';

const meta = {
  title: 'Organisms/Table/TableColumnCompacts',
  component: TableColumnCompacts,
  args: {
    items: [
      { id: 'state', node: 'Active' },
      { id: 'last', node: '2h' },
      { id: 'alerts', node: 'SMS' },
    ],
  },
} satisfies Meta<typeof TableColumnCompacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Folded: Story = {};

export const Empty: Story = {
  args: { items: [] },
};
