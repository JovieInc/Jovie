import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableHeaderRow } from './TableHeaderRow';

const meta = {
  title: 'Organisms/Table/TableHeaderRow',
  component: TableHeaderRow,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableHeaderRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <table>
      <thead>
        <TableHeaderRow>
          <th scope='col'>Name</th>
          <th scope='col'>Status</th>
          <th scope='col'>Amount</th>
        </TableHeaderRow>
      </thead>
    </table>
  ),
};

export const StickyOffset: Story = {
  render: () => (
    <table>
      <thead>
        <TableHeaderRow stickyOffset={40}>
          <th scope='col'>Name</th>
          <th scope='col'>Status</th>
          <th scope='col'>Amount</th>
        </TableHeaderRow>
      </thead>
    </table>
  ),
};
