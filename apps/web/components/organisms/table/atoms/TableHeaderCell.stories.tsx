import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableHeaderCell } from './TableHeaderCell';

const meta = {
  title: 'Organisms/Table/Atoms/TableHeaderCell',
  component: TableHeaderCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Title',
  },
  render: ({ children, ...args }) => (
    <table>
      <thead>
        <tr>
          <TableHeaderCell {...args}>{children ?? 'Title'}</TableHeaderCell>
        </tr>
      </thead>
    </table>
  ),
} satisfies Meta<typeof TableHeaderCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Sortable: Story = {
  args: {
    children: 'Released',
    sortable: true,
    sortDirection: 'asc',
    onSort: () => undefined,
  },
};
