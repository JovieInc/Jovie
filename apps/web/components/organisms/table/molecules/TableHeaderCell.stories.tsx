import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Header } from '@tanstack/react-table';
import { TableHeaderCell } from './TableHeaderCell';

type Row = { title: string };

function mockHeader(label: string): Header<Row, unknown> {
  return {
    id: label,
    isPlaceholder: false,
    getSize: () => 160,
    column: {
      columnDef: {
        header: label,
        meta: undefined,
      },
      getCanSort: () => true,
      getIsSorted: () => false,
      getToggleSortingHandler: () => () => undefined,
    },
    getContext: () => ({}),
  } as unknown as Header<Row, unknown>;
}

const meta: Meta<typeof TableHeaderCell<Row>> = {
  title: 'Organisms/Table/TableHeaderCell',
  component: TableHeaderCell,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof TableHeaderCell<Row>>;

export const Sortable: Story = {
  render: () => (
    <table>
      <thead>
        <tr>
          <TableHeaderCell
            header={mockHeader('Title')}
            canSort
            sortDirection='asc'
            stickyHeaderClass='sticky top-0 bg-surface'
            tableHeaderClass='text-sm font-medium text-primary'
            onToggleSort={() => undefined}
          />
        </tr>
      </thead>
    </table>
  ),
};

export const Plain: Story = {
  render: () => (
    <table>
      <thead>
        <tr>
          <TableHeaderCell
            header={mockHeader('Actions')}
            canSort={false}
            sortDirection={false}
            stickyHeaderClass='sticky top-0 bg-surface'
            tableHeaderClass='text-sm font-medium text-primary'
          />
        </tr>
      </thead>
    </table>
  ),
};
