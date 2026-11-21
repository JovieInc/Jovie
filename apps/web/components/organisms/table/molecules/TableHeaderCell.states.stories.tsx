import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Header } from '@/lib/tanstack-table';
import { TableHeaderCell } from './TableHeaderCell';

type Row = { title: string };

function mockHeader(label: string, placeholder = false): Header<Row, unknown> {
  return {
    id: label,
    isPlaceholder: placeholder,
    getSize: () => 160,
    column: {
      columnDef: { header: label, meta: undefined },
      getCanSort: () => true,
      getIsSorted: () => false,
      getToggleSortingHandler: () => () => undefined,
    },
    getContext: () => ({}),
  } as unknown as Header<Row, unknown>;
}

const meta: Meta<typeof TableHeaderCell<Row>> = {
  title: 'Organisms/Table/TableHeaderCell/States',
  component: TableHeaderCell,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof TableHeaderCell<Row>>;

function HeaderFrame({
  header,
  canSort,
  dir,
}: {
  readonly header: Header<Row, unknown>;
  readonly canSort: boolean;
  readonly dir?: 'rtl';
}) {
  return (
    <table dir={dir} className='w-48 table-fixed'>
      <thead>
        <tr>
          <TableHeaderCell
            header={header}
            canSort={canSort}
            sortDirection='desc'
            stickyHeaderClass='sticky top-0 bg-surface-1'
            tableHeaderClass='text-sm font-medium text-primary-token'
            onToggleSort={() => undefined}
          />
        </tr>
      </thead>
    </table>
  );
}

/** Empty: a placeholder header renders its cell with no content. */
export const Empty: Story = {
  render: () => (
    <HeaderFrame header={mockHeader('Group', true)} canSort={false} />
  ),
};

/** Partial: a plain header that cannot be sorted. */
export const Partial: Story = {
  render: () => <HeaderFrame header={mockHeader('Actions')} canSort={false} />,
};

/** LongContent: a long label truncates beside the sort indicator. */
export const LongContent: Story = {
  render: () => (
    <HeaderFrame
      header={mockHeader('Monthly listeners across every connected platform')}
      canSort
    />
  ),
};

/** Rtl: the sort indicator mirrors to the end edge. */
export const Rtl: Story = {
  render: () => (
    <HeaderFrame header={mockHeader('العنوان')} canSort dir='rtl' />
  ),
};
