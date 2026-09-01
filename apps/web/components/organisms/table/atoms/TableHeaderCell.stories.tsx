import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableHeaderCell } from './TableHeaderCell';

const meta = {
  title: 'Organisms/Table/Atoms/TableHeaderCell',
  component: TableHeaderCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableHeaderCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <table>
      <thead>
        <tr>
          <TableHeaderCell>Title</TableHeaderCell>
          <TableHeaderCell align='right'>Count</TableHeaderCell>
        </tr>
      </thead>
    </table>
  ),
};

export const Sortable: Story = {
  render: () => (
    <table>
      <thead>
        <tr>
          <TableHeaderCell sortable sortDirection='asc' onSort={() => undefined}>
            Release Date
          </TableHeaderCell>
        </tr>
      </thead>
    </table>
  ),
};
